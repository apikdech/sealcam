package mux_test

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
	"time"

	"github.com/apikdech/zrelay-v2/internal/relay/camera"
	"github.com/apikdech/zrelay-v2/internal/relay/mux"
	"github.com/apikdech/zrelay-v2/internal/relay/ring"
	"github.com/apikdech/zrelay-v2/internal/testutil"
)

// find returns the bodies of every box of type typ found at any depth under b.
func find(b []byte, typ string) [][]byte {
	var out [][]byte
	for pos := 0; pos+8 <= len(b); {
		n := int(binary.BigEndian.Uint32(b[pos:]))
		if n < 8 || pos+n > len(b) {
			return out
		}
		body := b[pos+8 : pos+n]
		if string(b[pos+4:pos+8]) == typ {
			out = append(out, body)
		}
		switch string(b[pos+4 : pos+8]) {
		case "moov", "trak", "mdia", "minf", "stbl", "mvex", "moof", "traf", "dinf":
			out = append(out, find(body, typ)...)
		case "stsd":
			out = append(out, find(body[8:], typ)...)
		}
		pos += n
	}
	return out
}

func TestNewVideoOnlyInitUnchanged(t *testing.T) {
	c, gops := fixture(t, h264Fixture, "h264")
	var buf bytes.Buffer
	m, err := mux.New(&buf, c, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, g := range gops[:2] {
		if err := m.WriteGOP(g); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile("testdata/video-only-h264.golden")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(buf.Bytes(), want) {
		t.Fatalf("video-only output differs from the golden bytes captured before audio support (%d vs %d bytes)", buf.Len(), len(want))
	}
	if got := m.Stats().AudioCodec; got != "" {
		t.Fatalf("Stats.AudioCodec = %q, want empty", got)
	}
}

func TestInitHasAlawTrack(t *testing.T) {
	for codec, entry := range map[string]string{"PCMA": "alaw", "PCMU": "ulaw"} {
		c, _ := fixture(t, h264Fixture, "h264")
		var buf bytes.Buffer
		m, err := mux.New(&buf, c, codec)
		if err != nil {
			t.Fatalf("%s: %v", codec, err)
		}
		if got := m.Stats().AudioCodec; got != codec {
			t.Fatalf("Stats.AudioCodec = %q, want %q", got, codec)
		}
		b := buf.Bytes()
		if int64(len(b)) != m.Stats().InitSegmentBytes {
			t.Fatalf("InitSegmentBytes = %d, wrote %d", m.Stats().InitSegmentBytes, len(b))
		}
		top := topBoxes(t, b)
		if len(top) != 2 || top[0].typ != "ftyp" || top[1].typ != "moov" {
			t.Fatalf("top boxes = %+v", top)
		}
		moov := b[top[1].start:top[1].end]
		if got := len(find(moov, "trak")); got != 2 {
			t.Fatalf("%s: %d traks, want 2", codec, got)
		}
		if got := len(find(moov, "trex")); got != 2 {
			t.Fatalf("%s: %d trex, want 2", codec, got)
		}
		traks := find(moov, "trak")
		tkhd := find(traks[1], "tkhd")[0]
		if id := binary.BigEndian.Uint32(tkhd[12:]); id != 2 {
			t.Fatalf("track 2 tkhd id = %d", id)
		}
		if ts := binary.BigEndian.Uint32(find(traks[1], "mdhd")[0][12:]); ts != 8000 {
			t.Fatalf("mdhd timescale = %d", ts)
		}
		stsd := find(traks[1], "stsd")
		if len(stsd) != 1 {
			t.Fatalf("stsd count %d", len(stsd))
		}
		e := stsd[0][8:] // after version/flags and entry_count
		if string(e[4:8]) != entry {
			t.Fatalf("%s: sample entry %q, want %q", codec, e[4:8], entry)
		}
		body := e[8:]
		if ch, ss, sr := binary.BigEndian.Uint16(body[16:]), binary.BigEndian.Uint16(body[18:]), binary.BigEndian.Uint32(body[24:])>>16; ch != 1 || ss != 16 || sr != 8000 {
			t.Fatalf("%s: channels %d samplesize %d rate %d", codec, ch, ss, sr)
		}
		for _, trex := range find(moov, "trex") {
			if binary.BigEndian.Uint32(trex[8:]) != 1 { // default sample description index
				t.Fatalf("trex = %x", trex)
			}
		}
		trex2 := find(moov, "trex")[1]
		if binary.BigEndian.Uint32(trex2[12:]) != 1 || binary.BigEndian.Uint32(trex2[16:]) != 1 {
			t.Fatalf("audio trex default duration/size = %x, want 1/1", trex2[12:20])
		}
	}
}

// pkts returns n packets of size bytes each, contiguous in RTP time, the first
// at wall time w0 and RTP timestamp ts0.
func pkts(codec string, w0 time.Time, ts0 uint32, n, size int) []*camera.AudioPacket {
	var out []*camera.AudioPacket
	for i := 0; i < n; i++ {
		p := make([]byte, size)
		for j := range p {
			p[j] = byte(i*size + j)
		}
		out = append(out, &camera.AudioPacket{
			Codec: codec, Payload: p, Timestamp: ts0 + uint32(i*size),
			Wall: w0.Add(time.Duration(i*size) * time.Second / 8000),
		})
	}
	return out
}

type frag struct {
	track   uint32
	seq     uint32
	base    uint64
	samples int
	durs    map[uint32]bool
	sizes   map[uint32]bool
	mdatLen int
	moofLen int
	mdat    []byte
}

// fragments parses the top-level moof+mdat pairs after the init segment.
func fragments(t *testing.T, b []byte) []frag {
	t.Helper()
	var out []frag
	top := topBoxes(t, b)
	for i := 0; i < len(top); i++ {
		if top[i].typ != "moof" {
			continue
		}
		moof := b[top[i].start+8 : top[i].end]
		if i+1 >= len(top) || top[i+1].typ != "mdat" {
			t.Fatalf("moof at %d not followed by mdat", top[i].start)
		}
		if n := len(find(moof, "traf")); n != 1 {
			t.Fatalf("moof has %d trafs", n)
		}
		f := frag{mdatLen: top[i+1].end - top[i+1].start - 8, durs: map[uint32]bool{}, sizes: map[uint32]bool{},
			moofLen: top[i].end - top[i].start, mdat: b[top[i+1].start+8 : top[i+1].end]}
		f.seq = binary.BigEndian.Uint32(find(moof, "mfhd")[0][4:])
		tfhd := find(moof, "tfhd")[0]
		f.track = binary.BigEndian.Uint32(tfhd[4:])
		tfFlags := binary.BigEndian.Uint32(tfhd) & 0xffffff
		var defDur, defSize uint32
		tp := 8
		if tfFlags&1 != 0 {
			tp += 8
		}
		if tfFlags&2 != 0 {
			tp += 4
		}
		if tfFlags&8 != 0 {
			defDur = binary.BigEndian.Uint32(tfhd[tp:])
			tp += 4
		}
		if tfFlags&0x10 != 0 {
			defSize = binary.BigEndian.Uint32(tfhd[tp:])
		}
		tfdt := find(moof, "tfdt")[0]
		if tfdt[0] != 1 {
			t.Fatalf("tfdt version %d", tfdt[0])
		}
		f.base = binary.BigEndian.Uint64(tfdt[4:])
		trun := find(moof, "trun")[0]
		flags := binary.BigEndian.Uint32(trun) & 0xffffff
		f.samples = int(binary.BigEndian.Uint32(trun[4:]))
		pos := 8
		if flags&1 != 0 {
			pos += 4
		}
		if flags&4 != 0 {
			pos += 4
		}
		for s := 0; s < f.samples; s++ {
			if flags&0x100 != 0 {
				f.durs[binary.BigEndian.Uint32(trun[pos:])] = true
				pos += 4
			} else {
				f.durs[defDur] = true
			}
			if flags&0x200 != 0 {
				f.sizes[binary.BigEndian.Uint32(trun[pos:])] = true
				pos += 4
			} else {
				f.sizes[defSize] = true
			}
			if flags&0x400 != 0 {
				pos += 4
			}
			if flags&0x800 != 0 {
				pos += 4
			}
		}
		out = append(out, f)
		i++
	}
	return out
}

func audioMux(t *testing.T) (*mux.Muxer, *bytes.Buffer, []*ring.GOP) {
	t.Helper()
	c, gops := fixture(t, h264Fixture, "h264")
	var buf bytes.Buffer
	m, err := mux.New(&buf, c, "PCMA")
	if err != nil {
		t.Fatal(err)
	}
	return m, &buf, gops
}

func audioFrags(t *testing.T, b []byte) []frag {
	var out []frag
	for _, f := range fragments(t, b) {
		if f.track == 2 {
			out = append(out, f)
		}
	}
	return out
}

func TestAudioFragmentsFollowVideo(t *testing.T) {
	m, buf, gops := audioMux(t)
	g := gops[0]
	// first packet 30 ms after the GOP start
	g.Audio = pkts("PCMA", g.Start.Add(30*time.Millisecond), 1000, 5, 160)
	if err := m.WriteGOP(g); err != nil {
		t.Fatal(err)
	}
	init := int(m.Stats().InitSegmentBytes)
	top := topBoxes(t, buf.Bytes()[init:])
	var types []string
	for _, b := range top {
		types = append(types, b.typ)
	}
	if len(types) != 4 || types[0] != "moof" || types[1] != "mdat" || types[2] != "moof" || types[3] != "mdat" {
		t.Fatalf("boxes = %v, want moof mdat moof mdat", types)
	}
	fs := fragments(t, buf.Bytes()[init:])
	if fs[0].track != 1 || fs[1].track != 2 {
		t.Fatalf("tracks = %d,%d", fs[0].track, fs[1].track)
	}
	if fs[1].base != uint64(math.Round(0.030*8000)) {
		t.Fatalf("audio tfdt = %d, want 240", fs[1].base)
	}
	if fs[1].samples != 800 || fs[1].mdatLen != 800 || len(fs[1].durs) != 1 || !fs[1].durs[1] {
		t.Fatalf("audio fragment = %+v", fs[1])
	}
	if fs[1].moofLen >= 200 || len(fs[1].sizes) != 1 || !fs[1].sizes[1] {
		t.Fatalf("audio moof is %d B, sizes %v; want < 200 B and size 1 per sample", fs[1].moofLen, fs[1].sizes)
	}
	var want []byte
	for _, p := range g.Audio {
		want = append(want, p.Payload...)
	}
	if !bytes.Equal(fs[1].mdat, want) {
		t.Fatal("audio mdat is not the packet payloads in order")
	}
	if fs[0].seq != 1 || fs[1].seq != 2 {
		t.Fatalf("sequence numbers %d,%d, want 1,2", fs[0].seq, fs[1].seq)
	}
	if n := len(m.Stats().SeekIndex); n != 1 {
		t.Fatalf("SeekIndex has %d entries, want 1", n)
	}
}

func TestAudioRunsSplitOnGap(t *testing.T) {
	m, buf, gops := audioMux(t)
	g := gops[0]
	ps := pkts("PCMA", g.Start, 0, 3, 160)
	ps[2].Timestamp = 480 // 160..319 is missing in RTP time
	ps[2].Wall = g.Start.Add(100 * time.Millisecond)
	g.Audio = ps
	if err := m.WriteGOP(g); err != nil {
		t.Fatal(err)
	}
	fs := audioFrags(t, buf.Bytes()[m.Stats().InitSegmentBytes:])
	if len(fs) != 2 {
		t.Fatalf("%d audio fragments, want 2", len(fs))
	}
	if fs[0].base != 0 || fs[0].samples != 320 || fs[1].base != 800 || fs[1].samples != 160 {
		t.Fatalf("fragments = %+v", fs)
	}
}

func TestAudioRunContinuesAcrossGOPs(t *testing.T) {
	m, buf, gops := audioMux(t)
	g0, g1 := gops[0], gops[1]
	g0.Audio = pkts("PCMA", g0.Start, 0, 2, 160)
	// the next packet continues in RTP time but its Wall is jittered ahead
	g1.Audio = pkts("PCMA", g0.Start.Add(41*time.Millisecond), 320, 2, 160)
	for _, g := range []*ring.GOP{g0, g1} {
		if err := m.WriteGOP(g); err != nil {
			t.Fatal(err)
		}
	}
	fs := audioFrags(t, buf.Bytes()[m.Stats().InitSegmentBytes:])
	if len(fs) != 2 || fs[0].base != 0 || fs[1].base != 320 {
		t.Fatalf("fragments = %+v, want tfdt 0 then 320 with no gap", fs)
	}
}

func TestAudioDropsOverlap(t *testing.T) {
	m, buf, gops := audioMux(t)
	g0, g1 := gops[0], gops[1]
	ps := pkts("PCMA", g0.Start, 0, 3, 160) // 0..480
	dup := *ps[1]
	g0.Audio = append(ps, &dup)
	// a new run (RTP jump) whose Wall lands inside the previous run
	back := pkts("PCMA", g0.Start.Add(10*time.Millisecond), 90000, 1, 160)
	g1.Audio = append(back, pkts("PCMA", g0.Start.Add(100*time.Millisecond), 91000, 1, 160)...)
	for _, g := range []*ring.GOP{g0, g1} {
		if err := m.WriteGOP(g); err != nil {
			t.Fatal(err)
		}
	}
	fs := audioFrags(t, buf.Bytes()[m.Stats().InitSegmentBytes:])
	if len(fs) != 2 {
		t.Fatalf("%d audio fragments, want 2: %+v", len(fs), fs)
	}
	if fs[0].samples != 480 {
		t.Fatalf("first fragment has %d samples, want 480 (duplicate dropped)", fs[0].samples)
	}
	if fs[1].base != 800 || fs[1].samples != 160 {
		t.Fatalf("second fragment = %+v, want tfdt 800 (overlapping packet dropped)", fs[1])
	}
	prev := uint64(0)
	for _, f := range fs {
		if f.base < prev {
			t.Fatalf("tfdt went backwards: %d after %d", f.base, prev)
		}
		prev = f.base
	}
}

func TestAudioBeforeClipStartDropped(t *testing.T) {
	m, buf, gops := audioMux(t)
	g := gops[0]
	pre := pkts("PCMA", g.Start.Add(-40*time.Millisecond), 0, 2, 160) // wall -40ms..0ms
	post := pkts("PCMA", g.Start, 5000, 1, 160)
	g.Audio = append(pre, post...)
	if err := m.WriteGOP(g); err != nil {
		t.Fatal(err)
	}
	fs := audioFrags(t, buf.Bytes()[m.Stats().InitSegmentBytes:])
	if len(fs) != 1 || fs[0].samples != 160 || fs[0].base != 0 {
		t.Fatalf("fragments = %+v, want one of 160 samples at 0", fs)
	}
}

func TestFfprobeSeesAlaw(t *testing.T) {
	m, buf, gops := audioMux(t)
	var ts uint32
	for _, g := range gops[:2] { // 4 s
		g.Audio = pkts("PCMA", g.Start.Add(50*time.Millisecond), ts, 100, 160)
		ts += 100 * 160
		if err := m.WriteGOP(g); err != nil {
			t.Fatal(err)
		}
	}
	out := testutil.FFProbe(t, buf.Bytes(), "-show_streams", "-of", "json")
	var res struct {
		Streams []struct {
			CodecName  string `json:"codec_name"`
			SampleRate string `json:"sample_rate"`
			Channels   int    `json:"channels"`
			StartTime  string `json:"start_time"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(out, &res); err != nil {
		t.Fatal(err)
	}
	t.Logf("ffprobe streams: %+v", res.Streams)
	var audio, video bool
	for _, s := range res.Streams {
		switch s.CodecName {
		case "h264":
			video = true
		case "pcm_alaw":
			audio = true
			var st float64
			if _, err := fmt.Sscan(s.StartTime, &st); err != nil || math.Abs(st-0.05) > 0.05 {
				t.Fatalf("audio start_time = %q, want within 0.05 s of 0.05", s.StartTime)
			}
			if s.SampleRate != "8000" || s.Channels != 1 {
				t.Fatalf("audio stream = %+v", s)
			}
		}
	}
	if !video || !audio {
		t.Fatalf("streams = %+v, want h264 and pcm_alaw", res.Streams)
	}
}
