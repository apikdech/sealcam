package clip_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/apikdech/zrelay-v2/internal/clock"
	"github.com/apikdech/zrelay-v2/internal/relay/camera"
	"github.com/apikdech/zrelay-v2/internal/relay/clip"
	"github.com/apikdech/zrelay-v2/internal/relay/ring"
)

// audioAt delivers one 160-byte G.711 packet stamped with the fake clock.
func (r *rig) audioAt(codec string) {
	r.m.OnAudio(&camera.AudioPacket{Codec: codec, Payload: make([]byte, 160), Wall: r.clk.Now()})
}

// feedAudio is feed with one audio packet after every video frame.
func (r *rig) feedAudio(d time.Duration, codec string) {
	r.t.Helper()
	for n := int(d / step); n > 0; n-- {
		r.feed(step)
		r.audioAt(codec)
	}
}

func audioCount(gops []*ring.GOP) int {
	n := 0
	for _, g := range gops {
		n += len(g.Audio)
	}
	return n
}

func TestPreRollCarriesAudio(t *testing.T) {
	r := newRig(t)
	r.feedAudio(40*time.Second, "PCMA")
	r.m.OnCodec(camera.Codec{Kind: "h264"}, camera.TimeSourceRTCP)
	r.m.OnTriggered(true)

	w := r.last()
	if len(w.gops) == 0 {
		t.Fatal("no pre-roll GOP flushed")
	}
	for i, g := range w.gops {
		if len(g.Audio) == 0 {
			t.Errorf("flushed GOP %d has no audio", i)
		}
	}
}

func TestActiveClipAudioInPend(t *testing.T) {
	r := newRig(t)
	r.feedAudio(20*time.Second, "PCMA")
	r.m.OnTriggered(true)
	w := r.last()
	before := audioCount(w.gops)
	r.feedAudio(10*time.Second, "PCMA") // closes GOPs through IDRs
	after := audioCount(w.gops)
	// The GOP open at the trigger (pend) plus every closed GOP since carry
	// the audio that arrived while each was open: 10 s at 15 packets/s, plus
	// the pre-roll audio of the pending GOP.
	if got := after - before; got < 10*fps {
		t.Errorf("audio in GOPs flushed while recording = %d, want >= %d", got, 10*fps)
	}
	for i, g := range w.gops {
		for _, p := range g.Audio {
			if p.Wall.Before(g.Start) {
				t.Errorf("GOP %d holds audio from %v before its start %v", i, p.Wall, g.Start)
			}
		}
	}
}

func TestOpenInfoAudioCodec(t *testing.T) {
	r := newRig(t)
	r.feed(20 * time.Second)
	r.m.OnTriggered(true)
	if got := r.last().info.AudioCodec; got != "" {
		t.Errorf("AudioCodec = %q with no audio seen, want empty", got)
	}

	r2 := newRig(t)
	r2.feedAudio(20*time.Second, "PCMA")
	r2.m.OnTriggered(true)
	if got := r2.last().info.AudioCodec; got != "PCMA" {
		t.Errorf("AudioCodec = %q, want PCMA", got)
	}
}

func TestAudioStartingMidClipIsNotRecorded(t *testing.T) {
	r := newRig(t)
	r.feed(20 * time.Second)
	r.m.OnTriggered(true)
	r.feedAudio(10*time.Second, "PCMA")
	r.m.OnTriggered(false)
	r.feed(postRoll + step)
	r.m.Tick()
	w := r.last()
	if n := audioCount(w.gops); n != 0 {
		t.Errorf("clip opened without audio recorded %d packets", n)
	}
	// The next clip does have the track.
	r.m.OnTriggered(true)
	if got := r.last().info.AudioCodec; got != "PCMA" {
		t.Errorf("next clip AudioCodec = %q, want PCMA", got)
	}
}

func TestAudioCodecChangeEndsClip(t *testing.T) {
	r := newRig(t)
	r.feedAudio(20*time.Second, "PCMA")
	r.m.OnTriggered(true)
	r.feedAudio(4*time.Second, "PCMA")
	first := r.last()
	r.audioAt("PCMU")
	mustReason(t, first, clip.ReasonCodecChange)
	// Still triggered: the series continues at the next IDR with the new codec.
	r.feedAudio(5*time.Second, "PCMU")
	if r.opens() != 2 {
		t.Fatalf("opens = %d, want the series to continue", r.opens())
	}
	if got := r.last().info.AudioCodec; got != "PCMU" {
		t.Errorf("continuation AudioCodec = %q, want PCMU", got)
	}
}

func TestSplitKeepsAudio(t *testing.T) {
	r := newRigMax(t, postRoll, 20*time.Second)
	r.feedAudio(20*time.Second, "PCMA")
	r.m.OnTriggered(true)
	r.feedAudio(30*time.Second, "PCMA")
	if r.opens() < 2 {
		t.Fatalf("opens = %d, want a split", r.opens())
	}
	second := r.out.writers[1]
	if second.info.AudioCodec != "PCMA" {
		t.Errorf("second segment AudioCodec = %q, want PCMA", second.info.AudioCodec)
	}
	if len(second.gops) == 0 || len(second.gops[0].Audio) == 0 {
		t.Fatalf("second segment's first GOP lost its audio: %+v", second.gops)
	}
	for _, p := range second.gops[0].Audio {
		if p.Wall.Before(second.gops[0].Start) {
			t.Errorf("audio at %v predates the segment's IDR at %v", p.Wall, second.gops[0].Start)
		}
	}
}

func TestOnLostResetsAudioCodec(t *testing.T) {
	r := newRig(t)
	r.feedAudio(20*time.Second, "PCMA")
	r.m.OnLost()
	r.feed(20 * time.Second)
	r.m.OnTriggered(true)
	if got := r.last().info.AudioCodec; got != "" {
		t.Errorf("AudioCodec = %q after a lost session without audio, want empty", got)
	}
}

func TestAudioBeforeFirstIDRDropped(t *testing.T) {
	r := newRig(t)
	r.audioAt("PCMA") // no GOP is open
	r.feed(20 * time.Second)
	r.m.OnTriggered(true)
	if n := audioCount(r.last().gops); n != 0 {
		t.Errorf("recorded %d packets that arrived before the first IDR", n)
	}
}

func TestSilentAudioLoggedOncePerSession(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(old) })

	clk := clock.NewFake(t0)
	rg := ring.New(preRoll, 1<<40, nil)
	m := clip.New(clip.Config{Camera: "cam1", PostRoll: postRoll, RecordAudio: true}, clk, rg, &fakeOutput{})
	m.OnVideo(&camera.AccessUnit{IDR: true, NALUs: [][]byte{{1}}, ParamGen: 1, Wall: clk.Now(), Bytes: 10})

	clk.Advance(4 * time.Second)
	m.Tick()
	if buf.Len() != 0 {
		t.Fatalf("logged before 5 s: %s", buf.String())
	}
	clk.Advance(time.Second)
	m.Tick()
	m.Tick()
	if got := strings.Count(buf.String(), "\n"); got != 1 || !strings.Contains(buf.String(), "level=INFO") {
		t.Fatalf("log = %q, want one INFO line about audio", buf.String())
	}

	// A new session logs again.
	buf.Reset()
	m.OnLost()
	m.OnVideo(&camera.AccessUnit{IDR: true, NALUs: [][]byte{{1}}, ParamGen: 1, Wall: clk.Now(), Bytes: 10})
	clk.Advance(5 * time.Second)
	m.Tick()
	if buf.Len() == 0 {
		t.Error("no log in the second session")
	}
}

func TestNoSilentAudioLogWhenAudioArrivesOrNotRequested(t *testing.T) {
	var buf bytes.Buffer
	old := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelInfo})))
	t.Cleanup(func() { slog.SetDefault(old) })

	for _, record := range []bool{true, false} {
		clk := clock.NewFake(t0)
		m := clip.New(clip.Config{Camera: "cam1", RecordAudio: record}, clk, ring.New(preRoll, 1<<40, nil), &fakeOutput{})
		m.OnVideo(&camera.AccessUnit{IDR: true, NALUs: [][]byte{{1}}, ParamGen: 1, Wall: clk.Now(), Bytes: 10})
		if record {
			m.OnAudio(&camera.AudioPacket{Codec: "PCMA", Payload: []byte{1}, Wall: clk.Now()})
		}
		clk.Advance(10 * time.Second)
		m.Tick()
	}
	if buf.Len() != 0 {
		t.Errorf("unexpected log: %s", buf.String())
	}
}
