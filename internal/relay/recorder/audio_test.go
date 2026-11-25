package recorder_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/apikdech/zrelay-v2/internal/clock"
	"github.com/apikdech/zrelay-v2/internal/relay/camera"
	"github.com/apikdech/zrelay-v2/internal/relay/clip"
	"github.com/apikdech/zrelay-v2/internal/relay/events"
	"github.com/apikdech/zrelay-v2/internal/relay/recorder"
	"github.com/apikdech/zrelay-v2/internal/relay/ring"
)

// gopSink is a clip.Output that keeps every GOP written to it.
type gopSink struct {
	mu   sync.Mutex
	info clip.OpenInfo
	gops []*ring.GOP
}

func (s *gopSink) Open(i clip.OpenInfo) (clip.ClipWriter, error) {
	s.mu.Lock()
	s.info = i
	s.mu.Unlock()
	return s, nil
}
func (s *gopSink) WriteGOP(g *ring.GOP) error {
	s.mu.Lock()
	s.gops = append(s.gops, g)
	s.mu.Unlock()
	return nil
}
func (s *gopSink) Finalize(clip.FinalInfo) error { return nil }
func (s *gopSink) Abort(clip.EndReason)          {}

// runAudioClip feeds two seconds of video with audio through a hub and the
// recorder loop and returns what the clip received: the open info and the
// GOPs written (the last GOP is flushed by the shutdown).
func runAudioClip(t *testing.T, opts ...camera.SubOption) (clip.OpenInfo, []*ring.GOP) {
	t.Helper()
	fc := clock.NewFake(t0)
	hub := camera.NewHub(cameraID)
	sub := hub.Subscribe(camera.ClassRecorder, 4096, opts...)
	tracker := events.NewTracker(time.Minute, fc)
	sink := &gopSink{}
	m := clip.New(clip.Config{Camera: cameraID, PostRoll: 5 * time.Second}, fc, ring.New(time.Second, 64<<20, nil), sink)
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { recorder.Run(ctx, sub, tracker, m); close(done) }()

	tracker.Apply(events.Signal{Camera: cameraID, Kind: events.KindMotion, Active: true, At: time.Now()})
	c, gops := fixture(t, t0)
	hub.Codec(c, camera.TimeSourceArrival)
	// Audio before the first IDR is dropped by the ring but sets the codec
	// the clip opens with.
	hub.Audio(&camera.AudioPacket{Codec: "PCMA", Payload: make([]byte, 160), Wall: t0})
	for _, au := range gops[0].AUs {
		hub.Video(au)
		hub.Audio(&camera.AudioPacket{Codec: "PCMA", Payload: make([]byte, 160), Wall: au.Wall})
	}
	eventually(t, "state Recording", func() bool { return m.State() == "Recording" })
	// Everything sent before this marker has been handled by the loop.
	hub.Video(gops[1].AUs[0])
	eventually(t, "GOP written", func() bool { sink.mu.Lock(); defer sink.mu.Unlock(); return len(sink.gops) > 0 })
	cancel()
	<-done
	sink.mu.Lock()
	defer sink.mu.Unlock()
	return sink.info, append([]*ring.GOP(nil), sink.gops...)
}

func TestRecorderIgnoresAudioWithoutOptIn(t *testing.T) {
	info, gops := runAudioClip(t)
	if info.AudioCodec != "" {
		t.Errorf("AudioCodec = %q without opt-in, want empty", info.AudioCodec)
	}
	for i, g := range gops {
		if len(g.Audio) != 0 {
			t.Errorf("GOP %d has %d audio packets without opt-in", i, len(g.Audio))
		}
	}
}

func TestRecorderFeedsOptedInAudioToMachine(t *testing.T) {
	info, gops := runAudioClip(t, camera.WithAudio())
	if info.AudioCodec != "PCMA" {
		t.Errorf("AudioCodec = %q, want PCMA", info.AudioCodec)
	}
	n := 0
	for _, g := range gops {
		n += len(g.Audio)
	}
	if n == 0 {
		t.Error("no audio reached the clip")
	}
}
