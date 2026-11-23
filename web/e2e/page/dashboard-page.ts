// Test page for e2e/dashboard.spec.ts: the real Watch screen (or, with ?shell, the app) with a canned
// API and a scripted player, so layout and keyboard handling run in a real
// browser engine. The clock is fixed at 2026-11-06 15:00 UTC (22:00 in Jakarta).
// `?long` gives the camera a long name; `?cams=2` adds a second camera, `?cams=4` three more.
import { createRawSnippet, mount } from 'svelte';
import '../../src/app.css';
import App from '../../src/App.svelte';
import Watch from '../../src/routes/watch/Watch.svelte';
import { DashClient, fakePlayerFactory, sidecar } from '../../test-support/dashboard-fakes';

const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);
const ULID = '01M6RXRJAQRJY105FSDF0QR';
const params = new URLSearchParams(location.search);
const client = new DashClient();
if (params.has('long')) client.cameras = [{ id: 'front-door', name: 'Front Door and the Path to the Garden Gate' }];
if (params.get('cams') === '2') client.cameras = [...client.cameras, { id: 'garage', name: 'Garage' }];
if (params.get('cams') === '4')
  client.cameras = [...client.cameras, { id: 'garage', name: 'Garage' }, { id: 'garden', name: 'Garden' }, { id: 'side-gate', name: 'Side Gate' }];
client.status = {
  schema: 'zrec.status/1',
  relay_id: 'r',
  version: 'v',
  updated_at: new Date(NOW - 4 * 60_000).toISOString().replace('.000Z', 'Z'),
  key_id: '0123456789abcdef',
  cameras: [],
};
client.clips = Array.from({ length: 400 }, (_, i) => {
  const id = ULID + String(i).padStart(3, '0');
  const start = new Date(Date.UTC(2026, 10, 6, 0, 0, 0) + i * 120_000).toISOString().replace('.000Z', 'Z');
  return sidecar(id, start, { camera: client.cameras[0] });
});

// The spec reads the requests the screen made (the canned API does not filter).
(window as unknown as { __calls: typeof client.calls }).__calls = client.calls;

// `?shell` mounts the whole app (one top bar) over the same canned API; the spec fixes the clock.
if (params.has('shell')) {
  mount(App, { target: document.getElementById('app')!, props: { client } });
} else {
  const topRight = createRawSnippet(() => ({ render: () => '<span data-testid="top-right"></span>' }));
  mount(Watch, {
    target: document.getElementById('app')!,
    props: { client, status: null, factory: fakePlayerFactory, zone: 'Asia/Jakarta', nowMs: NOW, profile: 'desktop', topRight },
  });
}
