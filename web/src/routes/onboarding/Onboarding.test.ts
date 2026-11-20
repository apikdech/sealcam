// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testKeyId, testKeyText } from '../../../test-support/onboarding-keys';
import type { Request } from '../../worker/protocol';
import { openKeystore } from '../../worker/keystore';
import { createWorker } from '../../worker/worker';
import Onboarding from './Onboarding.svelte';

const masterText = async () => testKeyText();
let KEY_ID = '';
let FP = '';
const OTHER_ID = '0123456789abcdef';

beforeEach(async () => {
  KEY_ID = await testKeyId();
  FP = KEY_ID.match(/.{4}/g)!.join('-');
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const clipsAt = (...keyIds: string[]) => ({
  clips: keyIds.map((k, i) => ({
    start_time: new Date(Date.UTC(2026, 10, 5, 0, 0, i)).toISOString(),
    video: { key_id: k },
  })),
  invalid: 0,
});

/** A scripted worker client that records every call. */
function fakeClient(opts: { clips?: unknown; gate?: Promise<void>; failOn?: Request['type'] } = {}) {
  const calls: Request[] = [];
  let keys: { keyId: string; remembered: boolean }[] = [];
  const client = {
    async call<T>(msg: Request): Promise<T> {
      calls.push(msg);
      if (opts.failOn === msg.type) throw new Error('worker exploded');
      switch (msg.type) {
        case 'key.import':
          keys = [...keys.filter((k) => k.keyId !== KEY_ID), { keyId: KEY_ID, remembered: msg.remember }];
          return { keyId: KEY_ID } as T;
        case 'key.list':
          return { keys } as T;
        case 'key.remember':
          keys = keys.map((k) => (k.keyId === msg.keyId ? { ...k, remembered: true } : k));
          return { keys } as T;
        case 'key.forget':
          keys = keys.filter((k) => k.keyId !== msg.keyId);
          return { keys } as T;
        case 'key.lock':
          keys = keys.filter((k) => k.remembered);
          return { keys } as T;
        case 'api.get':
          if (opts.gate) await opts.gate;
          return (opts.clips ?? clipsAt()) as T;
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
  };
  return { client, calls };
}

const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

async function addKey(remember = false) {
  await fireEvent.input(screen.getByLabelText('Family key'), { target: { value: await masterText() } });
  await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
  await screen.findByRole('heading', { name: 'Key added' });
  if (remember) await fireEvent.click(screen.getByRole('button', { name: 'Keep it on this phone' }));
}

const keyring = () => screen.findByRole('list', { name: /keyring/i });

describe('Keys page', () => {
  it('has the Keys heading and the import form', () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    expect(screen.getByRole('heading', { name: 'Keys' })).toBeInTheDocument();
    expect(screen.getByLabelText('Family key')).toBeInTheDocument();
  });

  it('lists an imported key with its fingerprint and "Only for now"', async () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey();
    const ring = await keyring();
    expect(within(ring).getByText(FP)).toBeInTheDocument();
    expect(within(ring).getByText('Only for now')).toBeInTheDocument();
  });

  it('lists remembered keys found on the device at startup', async () => {
    const { client, calls } = fakeClient();
    await client.call({ type: 'key.import', encoded: 'x', remember: true });
    calls.length = 0;
    render(Onboarding, { client, now: () => NOW });
    const ring = await keyring();
    expect(within(ring).getByText(FP)).toBeInTheDocument();
    expect(within(ring).getByText('Kept on this phone')).toBeInTheDocument();
    expect(calls[0]).toEqual({ type: 'key.list' });
  });

  it('refreshes the keyring when Keep it on this phone is chosen', async () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey(true);
    expect(within(await keyring()).getByText('Kept on this phone')).toBeInTheDocument();
  });
});

describe('lock', () => {
  it('Lock now is disabled with no key', () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    expect(screen.getByRole('button', { name: 'Lock now' })).toBeDisabled();
  });

  it('lock message for a remembered key', async () => {
    const { client, calls } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByText('Locked. Opening a recording unlocks it again on this device.')).toBeInTheDocument();
    expect(calls.some((c) => c.type === 'key.lock')).toBe(true);
  });

  it('lock message for a session-only key', async () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey();
    await fireEvent.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByText('Locked. Add the key again to watch.')).toBeInTheDocument();
  });

  it('shows an error instead of an unhandled rejection when Lock fails', async () => {
    const { client } = fakeClient({ failOn: 'key.lock' });
    await client.call({ type: 'key.import', encoded: 'x', remember: true });
    render(Onboarding, { client, now: () => NOW });
    await keyring();
    await fireEvent.click(screen.getByRole('button', { name: 'Lock now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not lock/i);
  });

  it('Lock discards a recent-recordings check that is still in flight', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { client } = fakeClient({ clips: clipsAt(OTHER_ID), gate });
    render(Onboarding, { client, now: () => NOW });
    await addKey();
    await screen.findByText('Checking recent recordings…');
    await fireEvent.click(screen.getByRole('button', { name: 'Lock now' }));
    await screen.findByText(/^Locked/);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/doesn't match/i)).toBeNull();
  });
});

describe('forget', () => {
  it('Forget asks first and Cancel keeps the key', async () => {
    const { client, calls } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey();
    const ring = await keyring();
    await fireEvent.click(within(ring).getByRole('button', { name: /^forget/i }));
    expect(screen.getByText('Forget this key on this device? You need the QR code or key text to add it again.')).toBeInTheDocument();
    expect(calls.some((c) => c.type === 'key.forget')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Forget this key on this device/)).toBeNull();
    expect(within(ring).getByText(FP)).toBeInTheDocument();
  });

  it('after Forget shows Key removed', async () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await addKey();
    await fireEvent.click(within(await keyring()).getByRole('button', { name: /^forget/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(await screen.findByText('Key removed from this device.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('list', { name: /keyring/i })).toBeNull());
  });

  it('shows an error instead of an unhandled rejection when Forget fails', async () => {
    const { client } = fakeClient({ failOn: 'key.forget' });
    await client.call({ type: 'key.import', encoded: 'x', remember: true });
    render(Onboarding, { client, now: () => NOW });
    await fireEvent.click(within(await keyring()).getByRole('button', { name: /^forget/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not forget/i);
  });

  it('Forget removes the key from the device: the IndexedDB keystore ends up empty', async () => {
    const idb = new IDBFactory();
    const worker = createWorker({ fetch: (async () => new Response('[]')) as typeof fetch, indexedDB: idb });
    const client = {
      call: async <T,>(msg: Request): Promise<T> => structuredClone((await worker.handle(msg)).result) as T,
    };
    render(Onboarding, { client, now: () => NOW });
    await addKey(true);
    const ring = await keyring();
    expect(within(ring).getByText(FP)).toBeInTheDocument();
    const store = await openKeystore(idb);
    expect((await store.all()).map(([id]) => id)).toEqual([KEY_ID]);
    await fireEvent.click(within(ring).getByRole('button', { name: /^forget/i }));
    await fireEvent.click(screen.getByRole('button', { name: 'Forget key' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: /keyring/i })).toBeNull());
    expect(await store.all()).toEqual([]);
    store.close();
  });
});

describe('idle auto-lock setting', () => {
  const LABEL = /lock when zview is in the background/i;
  function setVisibility(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }
  afterEach(() => setVisibility(false));

  it('defaults to off and persists the choice', async () => {
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    const select = screen.getByLabelText(LABEL) as HTMLSelectElement;
    expect(select.value).toBe('0');
    await fireEvent.change(select, { target: { value: '5' } });
    expect(localStorage.getItem('zview.idleLockMinutes')).toBe('5');
  });

  it('restores a saved setting', () => {
    localStorage.setItem('zview.idleLockMinutes', '15');
    const { client } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    expect((screen.getByLabelText(LABEL) as HTMLSelectElement).value).toBe('15');
  });

  it('locks the worker after the idle time with the tab hidden', async () => {
    vi.useFakeTimers();
    const { client, calls } = fakeClient();
    render(Onboarding, { client, now: () => NOW });
    await fireEvent.change(screen.getByLabelText(LABEL), { target: { value: '1' } });
    setVisibility(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(calls.some((c) => c.type === 'key.lock')).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls.some((c) => c.type === 'key.lock')).toBe(true);
  });

  it('auto-lock failing does not raise an unhandled rejection', async () => {
    vi.useFakeTimers();
    const { client } = fakeClient({ failOn: 'key.lock' });
    render(Onboarding, { client, now: () => NOW });
    await fireEvent.change(screen.getByLabelText(LABEL), { target: { value: '1' } });
    setVisibility(true);
    await vi.advanceTimersByTimeAsync(60_000);
    setVisibility(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not lock/i);
  });
});
