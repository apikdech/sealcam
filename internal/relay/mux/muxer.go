// Package mux writes the fMP4 plaintext content profile (Contract §5): an
// init segment (ftyp+moov) followed by one moof+mdat per GOP, video only,
// timescale 90 000, tfdt starting at 0 for the clip.
package mux

import (
	"errors"
	"fmt"
	"io"
	"math"
	"time"

	"github.com/bluenviron/mediacommon/v2/pkg/codecs/h264"
	"github.com/bluenviron/mediacommon/v2/pkg/formats/fmp4"
	"github.com/bluenviron/mediacommon/v2/pkg/formats/fmp4/seekablebuffer"
	"github.com/bluenviron/mediacommon/v2/pkg/formats/mp4/codecs"

	"github.com/apikdech/zrelay-v2/internal/relay/camera"
	"github.com/apikdech/zrelay-v2/internal/relay/ring"
)

const (
	timescale = 90000
	trackID   = 1
	// defaultDuration is used for a last sample whose duration cannot be
	// inferred (a first GOP of one access unit): one frame at 30 fps.
	defaultDuration = timescale / 30
)

// Stats is what the sidecar records about the bytes written so far.
type Stats struct {
	// InitSegmentBytes is the size of ftyp+moov.
	InitSegmentBytes int64
	// PlaintextBytes is everything written to the writer so far.
	PlaintextBytes int64
	// SeekIndex holds [t_ms, offset] per fragment: media time of the GOP
	// relative to the first one, and the plaintext offset of its moof box.
	SeekIndex [][2]int64
	// DurationMs is the media duration written so far.
	DurationMs int64
	// AudioCodec is "PCMA" or "PCMU" when the clip has an audio track, else "".
	AudioCodec string
}

// Muxer writes one clip. It is not safe for concurrent use.
type Muxer struct {
	w       io.Writer
	buf     seekablebuffer.Buffer // reused for every part
	kind    string
	seq     uint32
	started bool
	first   int64 // StartDTS of the first GOP
	lastDur uint32
	endDTS  int64 // DTS just after the last written sample
	stats   Stats

	audioCodec string
	origin     time.Time // Start of the first GOP: audio tfdt 0
	audioEnd   int64     // end of the last written audio sample, 8 kHz ticks
	havePrev   bool      // an audio packet has been written
	prevTS     uint32    // RTP timestamp of the last written packet
	prevLen    int       // payload length of the last written packet
}

// New returns a muxer for c and writes the init segment to w immediately.
// audioCodec is "" for a video-only clip, else "PCMA" or "PCMU", which adds
// the audio track (track 2).
func New(w io.Writer, c camera.Codec, audioCodec string) (*Muxer, error) {
	var codec codecs.Codec
	switch c.Kind {
	case "h264":
		codec = &codecs.H264{SPS: c.SPS, PPS: c.PPS}
	case "h265":
		codec = &codecs.H265{VPS: c.VPS, SPS: c.SPS, PPS: c.PPS}
	default:
		return nil, fmt.Errorf("mux: unsupported codec kind %q", c.Kind)
	}
	m := &Muxer{w: w, kind: c.Kind, lastDur: defaultDuration}
	init := fmp4.Init{Tracks: []*fmp4.InitTrack{{ID: trackID, TimeScale: timescale, Codec: codec}}}
	if err := init.Marshal(&m.buf); err != nil {
		return nil, fmt.Errorf("mux: init segment: %w", err)
	}
	if audioCodec != "" {
		b, err := withAudioTrack(m.buf.Bytes(), audioCodec)
		if err != nil {
			return nil, err
		}
		m.buf.Reset()
		if _, err := m.buf.Write(b); err != nil {
			return nil, fmt.Errorf("mux: init segment: %w", err)
		}
		m.audioCodec = audioCodec
		m.stats.AudioCodec = audioCodec
	}
	n, err := m.flush()
	m.stats.InitSegmentBytes = n
	if err != nil {
		return nil, fmt.Errorf("mux: write init segment: %w", err)
	}
	return m, nil
}

// flush copies the buffer to the writer and resets it.
func (m *Muxer) flush() (int64, error) {
	b := m.buf.Bytes()
	n, err := m.w.Write(b)
	if err == nil && n != len(b) {
		err = io.ErrShortWrite
	}
	m.stats.PlaintextBytes += int64(n)
	m.buf.Reset()
	return int64(n), err
}

// WriteGOP writes g as one moof+mdat. Only the first sample is a sync sample.
// With an audio track, the GOP's audio packets follow as audio-only fragments.
func (m *Muxer) WriteGOP(g *ring.GOP) error {
	if len(g.AUs) == 0 {
		return errors.New("mux: empty GOP")
	}
	if !m.started {
		m.first = g.StartDTS
		m.origin = g.Start
	}
	base := g.StartDTS - m.first
	if base < 0 {
		return fmt.Errorf("mux: GOP DTS %d precedes the clip start", g.StartDTS)
	}

	samples := make([]*fmp4.Sample, len(g.AUs))
	lastDur := m.lastDur
	for i, au := range g.AUs {
		s, err := m.sample(au)
		if err != nil {
			return err
		}
		s.IsNonSyncSample = i != 0
		switch {
		case i+1 < len(g.AUs):
			d := g.AUs[i+1].DTS - au.DTS
			if d <= 0 || d > math.MaxUint32 {
				return fmt.Errorf("mux: DTS step %d is not positive", d)
			}
			lastDur = uint32(d)
			s.Duration = lastDur
		default:
			s.Duration = lastDur
		}
		samples[i] = s
	}

	m.seq++
	part := fmp4.Part{
		SequenceNumber: m.seq,
		Tracks:         []*fmp4.PartTrack{{ID: trackID, BaseTime: uint64(base), Samples: samples}},
	}
	if err := part.Marshal(&m.buf); err != nil {
		return fmt.Errorf("mux: marshal fragment: %w", err)
	}

	offset := m.stats.PlaintextBytes
	if _, err := m.flush(); err != nil {
		return fmt.Errorf("mux: write fragment: %w", err)
	}
	m.started = true
	m.lastDur = lastDur
	last := g.AUs[len(g.AUs)-1]
	m.endDTS = last.DTS + int64(lastDur)
	m.stats.SeekIndex = append(m.stats.SeekIndex, [2]int64{base * 1000 / timescale, offset})
	m.stats.DurationMs = (m.endDTS - m.first) * 1000 / timescale
	if m.audioCodec != "" {
		return m.writeAudio(g.Audio)
	}
	return nil
}

func (m *Muxer) sample(au *camera.AccessUnit) (*fmp4.Sample, error) {
	off := au.PTS - au.DTS
	if off < math.MinInt32 || off > math.MaxInt32 {
		return nil, fmt.Errorf("mux: PTS-DTS offset %d out of range", off)
	}
	nalus := withoutParamSets(m.kind, au.NALUs)
	// H.264 and H.265 samples are both length-prefixed (AVCC) NAL units.
	payload, err := h264.AVCC(nalus).Marshal()
	if err != nil {
		return nil, fmt.Errorf("mux: sample: %w", err)
	}
	return &fmp4.Sample{PTSOffset: int32(off), Payload: payload}, nil
}

// Stats returns the sizes and seek index recorded so far. SeekIndex is a copy.
func (m *Muxer) Stats() Stats {
	s := m.stats
	s.SeekIndex = append([][2]int64(nil), s.SeekIndex...)
	return s
}
