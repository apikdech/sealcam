package mux

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/bluenviron/mediacommon/v2/pkg/formats/fmp4"

	"github.com/apikdech/zrelay-v2/internal/relay/camera"
)

const (
	audioTrackID   = 2
	audioTimescale = 8000
)

// audioEntryType maps a G.711 codec name to its sample entry type.
func audioEntryType(codec string) (string, error) {
	switch codec {
	case "PCMA":
		return "alaw", nil
	case "PCMU":
		return "ulaw", nil
	}
	return "", fmt.Errorf("mux: unsupported audio codec %q", codec)
}

// mkBox returns a box with the given type and body.
func mkBox(typ string, body ...[]byte) []byte {
	n := 8
	for _, b := range body {
		n += len(b)
	}
	out := make([]byte, 8, n)
	binary.BigEndian.PutUint32(out, uint32(n))
	copy(out[4:], typ)
	for _, b := range body {
		out = append(out, b...)
	}
	return out
}

func u32s(v ...uint32) []byte {
	out := make([]byte, 4*len(v))
	for i, x := range v {
		binary.BigEndian.PutUint32(out[4*i:], x)
	}
	return out
}

func u16s(v ...uint16) []byte {
	out := make([]byte, 2*len(v))
	for i, x := range v {
		binary.BigEndian.PutUint16(out[2*i:], x)
	}
	return out
}

// audioTrak builds the track 2 box: G.711, mono, 8 kHz, sample size 16.
func audioTrak(entry string) []byte {
	matrix := u32s(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000)
	tkhd := mkBox("tkhd", u32s(0x00000003, 0, 0, audioTrackID, 0, 0), make([]byte, 8),
		u16s(0, 0, 0x0100, 0), matrix, u32s(0, 0))
	mdhd := mkBox("mdhd", u32s(0, 0, 0, audioTimescale, 0), u16s(0x55c4, 0))
	hdlr := mkBox("hdlr", u32s(0, 0), []byte("soun"), make([]byte, 12), []byte("SoundHandler\x00"))
	smhd := mkBox("smhd", u32s(0), u16s(0, 0))
	dinf := mkBox("dinf", mkBox("dref", u32s(0, 1), mkBox("url ", u32s(1))))
	sampleEntry := mkBox(entry, make([]byte, 6), u16s(1), make([]byte, 8), u16s(1, 16, 0, 0), u32s(audioTimescale<<16))
	stbl := mkBox("stbl",
		mkBox("stsd", u32s(0, 1), sampleEntry),
		mkBox("stts", u32s(0, 0)),
		mkBox("stsc", u32s(0, 0)),
		mkBox("stsz", u32s(0, 0, 0)),
		mkBox("stco", u32s(0, 0)))
	minf := mkBox("minf", smhd, dinf, stbl)
	return mkBox("trak", tkhd, mkBox("mdia", mdhd, hdlr, minf))
}

// audioTrex builds the track 2 defaults box.
func audioTrex() []byte {
	return mkBox("trex", u32s(0, audioTrackID, 1, 0, 0, 0))
}

// withAudioTrack adds track 2 to a video-only init segment (ftyp+moov): the
// trak goes before mvex and a trex joins mvex. mediacommon has no G.711 codec,
// so the boxes are written here.
func withAudioTrack(init []byte, codec string) ([]byte, error) {
	entry, err := audioEntryType(codec)
	if err != nil {
		return nil, err
	}
	children := func(b []byte) ([][]byte, error) {
		var out [][]byte
		for len(b) > 0 {
			if len(b) < 8 {
				return nil, fmt.Errorf("mux: truncated init box")
			}
			n := int(binary.BigEndian.Uint32(b))
			if n < 8 || n > len(b) {
				return nil, fmt.Errorf("mux: bad init box size %d", n)
			}
			out = append(out, b[:n])
			b = b[n:]
		}
		return out, nil
	}
	top, err := children(init)
	if err != nil {
		return nil, err
	}
	var out []byte
	for _, tb := range top {
		if string(tb[4:8]) != "moov" {
			out = append(out, tb...)
			continue
		}
		kids, err := children(tb[8:])
		if err != nil {
			return nil, err
		}
		var body []byte
		for _, k := range kids {
			if string(k[4:8]) == "mvex" {
				body = append(body, audioTrak(entry)...)
				k = mkBox("mvex", k[8:], audioTrex())
			}
			body = append(body, k...)
		}
		out = append(out, mkBox("moov", body)...)
	}
	return out, nil
}

// ticks converts a wall time to 8 kHz samples since the clip start, rounded.
func (m *Muxer) ticks(t time.Time) int64 {
	d := t.Sub(m.origin)
	if d < 0 {
		return -1
	}
	return (int64(d)*audioTimescale + int64(time.Second/2)) / int64(time.Second)
}

// writeAudio writes the audio packets carried by one GOP as audio-only
// fragments. Packets before the clip start, duplicates and packets that would
// overlap earlier audio are dropped. A run of contiguous RTP timestamps
// becomes one fragment per GOP; a gap starts a new run.
func (m *Muxer) writeAudio(pkts []*camera.AudioPacket) error {
	var cur []*camera.AudioPacket
	var base int64
	flush := func() error {
		if len(cur) == 0 {
			return nil
		}
		n := 0
		for _, p := range cur {
			n += len(p.Payload)
		}
		backing := make([]fmp4.Sample, n)
		samples := make([]*fmp4.Sample, n)
		i := 0
		for _, p := range cur {
			for j := range p.Payload {
				backing[i] = fmp4.Sample{Duration: 1, Payload: p.Payload[j : j+1]}
				samples[i] = &backing[i]
				i++
			}
		}
		cur = cur[:0]
		m.seq++
		part := fmp4.Part{
			SequenceNumber: m.seq,
			Tracks:         []*fmp4.PartTrack{{ID: audioTrackID, BaseTime: uint64(base), Samples: samples}},
		}
		if err := part.Marshal(&m.buf); err != nil {
			return fmt.Errorf("mux: marshal audio fragment: %w", err)
		}
		if _, err := m.flush(); err != nil {
			return fmt.Errorf("mux: write audio fragment: %w", err)
		}
		return nil
	}

	for _, p := range pkts {
		if p.Codec != m.audioCodec || len(p.Payload) == 0 {
			continue
		}
		start := m.ticks(p.Wall)
		if start < 0 {
			continue // before the clip start
		}
		continues := m.havePrev && p.Timestamp == m.prevTS+uint32(m.prevLen)
		if continues {
			start = m.audioEnd
		} else if start < m.audioEnd {
			continue // duplicate or overlap
		}
		if !continues {
			if err := flush(); err != nil {
				return err
			}
		}
		if len(cur) == 0 {
			base = start
		}
		cur = append(cur, p)
		m.audioEnd = start + int64(len(p.Payload))
		m.havePrev, m.prevTS, m.prevLen = true, p.Timestamp, len(p.Payload)
	}
	return flush()
}
