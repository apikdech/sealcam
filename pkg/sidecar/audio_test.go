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

func TestAudioInvalid(t *testing.T) {
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
