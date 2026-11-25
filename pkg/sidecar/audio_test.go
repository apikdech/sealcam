package sidecar

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func validFixture(t *testing.T) *Sidecar {
	t.Helper()
	sc, err := Decode(readFixture(t, "valid_complete.json"))
	if err != nil {
		t.Fatal(err)
	}
	return sc
}

func TestAudioOmittedWhenNil(t *testing.T) {
	sc := validFixture(t)
	b, err := json.Marshal(sc)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), `"audio"`) {
		t.Errorf("marshal of a sidecar without audio has an audio key: %s", b)
	}
}

func TestAudioValid(t *testing.T) {
	sc := validFixture(t)
	for _, codec := range []string{"PCMA", "PCMU"} {
		sc.Audio = &Audio{Codec: codec, SampleRate: 8000, Channels: 1}
		if err := sc.Validate(); err != nil {
			t.Errorf("%s: Validate: %v", codec, err)
		}
	}
	sc.Audio = &Audio{Codec: "PCMA", SampleRate: 8000, Channels: 1}
	b, err := json.Marshal(sc)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(b)
	if err != nil {
		t.Fatal(err)
	}
	if got.Audio == nil || *got.Audio != *sc.Audio {
		t.Errorf("round trip audio = %+v", got.Audio)
	}
}

// The writer side never emits an invalid audio hint: Validate still checks it.
func TestAudioInvalidFailsWriterValidate(t *testing.T) {
	cases := map[string]Audio{
		"audio.codec":       {Codec: "opus", SampleRate: 8000, Channels: 1},
		"audio.sample_rate": {Codec: "PCMA", SampleRate: 16000, Channels: 1},
		"audio.channels":    {Codec: "PCMU", SampleRate: 8000, Channels: 2},
	}
	for field, a := range cases {
		t.Run(field, func(t *testing.T) {
			sc := validFixture(t)
			sc.Audio = &a
			var fe *FieldError
			if err := sc.Validate(); !errors.As(err, &fe) || fe.Field != field {
				t.Fatalf("err = %v, want field error on %s", err, field)
			}
		})
	}
}

// Readers treat an invalid or future audio hint as absent (Contract §6.2).
func TestDecodeInvalidAudioIsAbsent(t *testing.T) {
	base, err := json.Marshal(validFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	for name, audio := range map[string]string{
		"codec":       `{"codec":"opus","sample_rate":8000,"channels":1}`,
		"sample_rate": `{"codec":"PCMA","sample_rate":16000,"channels":1}`,
		"channels":    `{"codec":"PCMU","sample_rate":8000,"channels":2}`,
		"wrong type":  `{"codec":"PCMA","sample_rate":"8000","channels":1}`,
		"string":      `"pcma"`,
		"number":      `7`,
	} {
		t.Run(name, func(t *testing.T) {
			b := append(append([]byte{}, base[:len(base)-1]...), []byte(`,"audio":`+audio+`}`)...)
			sc, err := Decode(b)
			if err != nil {
				t.Fatalf("Decode: %v", err)
			}
			if sc.Audio != nil {
				t.Errorf("audio = %+v, want nil", sc.Audio)
			}
			if err := sc.Validate(); err != nil {
				t.Errorf("Validate: %v", err)
			}
		})
	}
}

func TestAudioNullIsAbsent(t *testing.T) {
	b, err := json.Marshal(validFixture(t))
	if err != nil {
		t.Fatal(err)
	}
	b = append(b[:len(b)-1], []byte(`,"audio":null}`)...)
	sc, err := Decode(b)
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if sc.Audio != nil {
		t.Errorf("audio = %+v, want nil", sc.Audio)
	}
	if err := sc.Validate(); err != nil {
		t.Errorf("Validate: %v", err)
	}
}
