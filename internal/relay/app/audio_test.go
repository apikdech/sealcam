package app_test

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/apikdech/zrelay-v2/internal/relay/app"
	"github.com/apikdech/zrelay-v2/internal/testutil"
	"github.com/apikdech/zrelay-v2/pkg/sidecar"
	"github.com/apikdech/zrelay-v2/pkg/zrec"
)

// TestAppRecordsAudio runs the whole pipeline against a beeping camera with
// record_audio on. "arrival" is like the home camera (no RTCP sender reports);
// "rtcp" checks that audio is still recorded once the audio NTP mapping exists.
func TestAppRecordsAudio(t *testing.T) {
	for _, tc := range []struct {
		name string
		rtcp bool
	}{{"arrival", false}, {"rtcp", true}} {
		t.Run(tc.name, func(t *testing.T) {
			rtsp := testutil.StartRTSPServer(t, testutil.RTSPServerOpts{
				AUs: testutil.LoadAnnexB(t, h264Fixture), Loop: true, AudioBeeps: true, RTCP: tc.rtcp,
			})
			onvif := testutil.StartFakeONVIF(t, testutil.FakeONVIFOpts{})
			r := newRigFor(t, rtsp, onvif, "    record_audio: true\n")
			run := start(t, r.cfg, app.Options{Version: "test"})

			eventually(t, "status/relay.json", 30*time.Second, func() bool {
				_, err := os.Stat(filepath.Join(r.base, "zrelay", "status", "relay.json"))
				return err == nil
			})
			// In arrival mode the session decides its time source 2 s of media
			// time after the first IDR and forwards no audio before that, and a
			// clip that opens without audio gets no track later. Let the
			// session settle so the clip opens with audio.
			time.Sleep(4 * time.Second)
			r.motion(true)
			eventually(t, "a video object being written", 40*time.Second, func() bool {
				return len(files(r.base, func(rel string) bool { return bytes.Contains([]byte(rel), []byte(".zrec")) })) > 0
			})
			time.Sleep(6 * time.Second)
			r.motion(false)
			eventually(t, "a clip sidecar", 40*time.Second, func() bool { return len(clipSidecars(r.base)) > 0 })
			if _, err := run.stop(t); err != nil {
				t.Fatalf("Run: %v", err)
			}

			scs := clipSidecars(r.base)
			if len(scs) != 1 {
				t.Fatalf("want one clip, got %v", scs)
			}
			b, err := os.ReadFile(scs[0])
			if err != nil {
				t.Fatal(err)
			}
			var sc sidecar.Sidecar
			if err := json.Unmarshal(b, &sc); err != nil {
				t.Fatal(err)
			}
			if sc.Audio == nil || sc.Audio.Codec != "PCMA" || sc.Audio.SampleRate != 8000 || sc.Audio.Channels != 1 {
				t.Fatalf("sidecar audio = %+v, want PCMA 8000 mono", sc.Audio)
			}

			mk, err := zrec.ParseMasterKey(r.cfg.Encryption.MasterKeyText)
			if err != nil {
				t.Fatal(err)
			}
			keys := zrec.Derive(mk)
			zb, err := os.ReadFile(filepath.Join(filepath.Dir(scs[0]), sc.Video.Object))
			if err != nil {
				t.Fatal(err)
			}
			zr, err := zrec.OpenReader(bytes.NewReader(zb), int64(len(zb)), zrec.Keyring{keys.ID: keys}, zrec.ReaderOptions{})
			if err != nil {
				t.Fatal(err)
			}
			var mp4 bytes.Buffer
			if _, err := zr.WriteTo(&mp4); err != nil {
				t.Fatal(err)
			}
			if !bytes.Contains(mp4.Bytes(), []byte("alaw")) {
				t.Fatalf("decrypted clip (%d bytes) has no alaw sample entry", mp4.Len())
			}
			// Track 2 fragments: a traf whose tfhd has track_ID 2 carries the audio.
			if !hasTrack2Fragment(mp4.Bytes()) {
				t.Errorf("no track 2 fragment in the clip")
			}
		})
	}
}

// hasTrack2Fragment reports whether some tfhd box (4 bytes version/flags, then
// the track ID) names track 2.
func hasTrack2Fragment(mp4 []byte) bool {
	for rest := mp4; ; {
		i := bytes.Index(rest, []byte("tfhd"))
		if i < 0 || i+12 > len(rest) {
			return false
		}
		if rest[i+8] == 0 && rest[i+9] == 0 && rest[i+10] == 0 && rest[i+11] == 2 {
			return true
		}
		rest = rest[i+4:]
	}
}
