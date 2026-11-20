// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testKeyId, testKeyText } from '../../../test-support/onboarding-keys';
import type { Request } from '../../worker/protocol';
import KeyImport from './KeyImport.svelte';

const OTHER_ID = '0123456789abcdef';
let KEY_ID = '';
let FP = '';
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

beforeEach(async () => {
  KEY_ID = await testKeyId();
  FP = KEY_ID.match(/.{4}/g)!.join('-');
});
afterEach(cleanup);

const clipsAt = (...keyIds: string[]) => ({
  clips: keyIds.map((k, i) => ({ start_time: new Date(Date.UTC(2026, 10, 5, 0, 0, i)).toISOString(), video: { key_id: k } })),
  invalid: 0,
});

function fakeClient(opts: { clips?: unknown; clipsError?: Error; stored?: boolean; importResult?: unknown } = {}) {
  const calls: Request[] = [];
  const client = {
    async call<T>(msg: Request): Promise<T> {
      calls.push(msg);
      switch (msg.type) {
        case 'key.import':
          return (opts.importResult ?? { keyId: KEY_ID }) as T;
        case 'key.list':
          return { keys: [{ keyId: KEY_ID, remembered: opts.stored ?? false }] } as T;
        case 'key.remember':
        case 'key.forget':
          return { keys: [] } as T;
        case 'api.get':
          if (opts.clipsError) throw opts.clipsError;
          return (opts.clips ?? clipsAt()) as T;
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
  };
  return { client, calls };
}

const field = () => screen.getByLabelText('Family key') as HTMLInputElement;
const typeKey = (v: string) => fireEvent.input(field(), { target: { value: v } });

const fakeScanner = (text: string | null) => ({
  open: async () => ({
    video: document.createElement('video'),
    grab: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    stop: () => {},
  }),
  decode: async () => text,
  wait: async () => {},
  frame: async () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
});

async function importTyped(client: ReturnType<typeof fakeClient>['client']) {
  render(KeyImport, { client, now: () => NOW });
  await typeKey(testKeyText());
  await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
  return screen.findByRole('heading', { name: 'Key added' });
}

describe('KeyImport field', () => {
  it('typo sets aria-invalid and the message', async () => {
    render(KeyImport, { client: fakeClient().client });
    const text = testKeyText();
    await typeKey(text.slice(0, -1) + (text.endsWith('0') ? '1' : '0'));
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('typo in key. Copy it again or scan the QR code.')).toBeInTheDocument();
  });

  it('validation text is linked by aria-describedby inside a polite live region', async () => {
    render(KeyImport, { client: fakeClient().client });
    await typeKey('zk1-abc');
    const msg = screen.getByText('Not a complete key yet.');
    expect(field().getAttribute('aria-describedby')).toBe(msg.id);
    expect(msg.closest('[aria-live="polite"]')).not.toBeNull();
    await typeKey(testKeyText());
    expect(screen.getByText('Key looks right.')).toBeInTheDocument();
    expect(field()).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('Show and Hide toggle masks the field', async () => {
    render(KeyImport, { client: fakeClient().client });
    expect(field().type).toBe('text');
    await fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(field().type).toBe('password');
    await fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(field().type).toBe('text');
  });

  it('Add key is disabled until the key is valid', async () => {
    render(KeyImport, { client: fakeClient().client });
    expect(screen.getByRole('button', { name: 'Add key' })).toBeDisabled();
    await typeKey(testKeyText());
    expect(screen.getByRole('button', { name: 'Add key' })).toBeEnabled();
  });
});

describe('KeyImport scanning and photos', () => {
  it('a scanned code imports without another tap', async () => {
    const { client, calls } = fakeClient();
    const text = testKeyText();
    const onImported = vi.fn();
    render(KeyImport, { client, now: () => NOW, scanner: fakeScanner(text), onImported });
    await fireEvent.click(screen.getByRole('button', { name: 'Scan QR code' }));
    await screen.findByRole('heading', { name: 'Key added' });
    expect(calls).toContainEqual({ type: 'key.import', encoded: text, remember: false });
    expect(onImported).toHaveBeenCalledWith(KEY_ID);
    expect(document.body.textContent).not.toContain('zk1-');
  });

  it('a photo with a QR imports it', async () => {
    const { client, calls } = fakeClient();
    render(KeyImport, { client, now: () => NOW, scanner: fakeScanner(testKeyText()) });
    const input = screen.getByLabelText('Use a photo of the QR code') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    await fireEvent.change(input, { target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] } });
    await screen.findByRole('heading', { name: 'Key added' });
    expect(calls.some((c) => c.type === 'key.import')).toBe(true);
  });

  it('a photo with no QR shows the message', async () => {
    render(KeyImport, { client: fakeClient().client, scanner: fakeScanner(null) });
    const input = screen.getByLabelText('Use a photo of the QR code');
    await fireEvent.change(input, { target: { files: [new File(['x'], 'qr.png', { type: 'image/png' })] } });
    expect(await screen.findByText('No QR code found in that photo.')).toBeInTheDocument();
  });
});

describe('KeyImport success panel', () => {
  it('takes focus and shows the fingerprint, clearing the field', async () => {
    const { client } = fakeClient({ clips: clipsAt(KEY_ID) });
    const heading = await importTyped(client);
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent(`Fingerprint ${FP}`);
    expect(document.body.textContent).not.toContain('zk1-');
    await waitFor(() => expect(screen.getByText('Matches recent recordings.')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Open Home' })).toHaveAttribute('href', '#/');
  });

  it('Keep it on this phone sends key.remember', async () => {
    const { client, calls } = fakeClient();
    await importTyped(client);
    expect(calls).toContainEqual({ type: 'key.import', encoded: testKeyText(), remember: false });
    await fireEvent.click(screen.getByRole('button', { name: 'Keep it on this phone' }));
    await waitFor(() => expect(calls).toContainEqual({ type: 'key.remember', keyId: KEY_ID }));
  });

  it('Only for now keeps the key out of storage', async () => {
    const { client, calls } = fakeClient();
    await importTyped(client);
    await fireEvent.click(screen.getByRole('button', { name: 'Only for now' }));
    expect(calls.some((c) => c.type === 'key.remember')).toBe(false);
  });

  it('mismatch offers Remove this key, which sends key.forget', async () => {
    const { client, calls } = fakeClient({ clips: clipsAt(OTHER_ID) });
    await importTyped(client);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("This key doesn't match recent recordings");
    expect(alert).toHaveTextContent(FP);
    expect(alert).toHaveTextContent('0123-4567-89ab-cdef');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove this key' }));
    await waitFor(() => expect(calls).toContainEqual({ type: 'key.forget', keyId: KEY_ID }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Key added' })).toBeNull());
  });

  it('a rejected key says so and offers Remove this key', async () => {
    const err = Object.assign(new Error('x'), { status: 401 });
    const { client } = fakeClient({ clipsError: err });
    await importTyped(client);
    expect(await screen.findByText('The server did not accept this key.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove this key' })).toBeInTheDocument();
  });

  it('a failed import shows fixed text and never the key', async () => {
    const client = {
      call: async () => {
        throw new Error('zk1-secret');
      },
    };
    render(KeyImport, { client: client as never });
    await typeKey(testKeyText());
    await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not import the key. Try again.');
    expect(document.body.textContent).not.toContain('secret');
  });
});

describe('KeyImport restored coverage and review fixes', () => {
  it('never puts the key in the URL, not even after a form submit', async () => {
    render(KeyImport, { client: fakeClient().client, now: () => NOW });
    const before = location.href;
    await typeKey(testKeyText());
    const form = field().closest('form');
    expect(form).not.toBeNull();
    expect(form!.getAttribute('action')).toBeNull();
    // fireEvent resolves to false when a handler called preventDefault (no native navigation).
    expect(await fireEvent.submit(form!)).toBe(false);
    await screen.findByRole('heading', { name: 'Key added' });
    expect(location.href).toBe(before);
    expect(location.href).not.toContain('zk1');
  });

  it('a checksum error from the worker shows the typo alert without leaking the key', async () => {
    const { client } = fakeClient({ importResult: { error: 'checksum' } });
    render(KeyImport, { client });
    await typeKey(testKeyText());
    await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('typo in key');
    expect(document.body.textContent).not.toContain(testKeyText().split('-')[1]);
  });

  it('429 on the check says the server did not accept the key', async () => {
    const { client } = fakeClient({ clipsError: Object.assign(new Error('x'), { status: 429 }) });
    await importTyped(client);
    expect(await screen.findByText('The server did not accept this key.')).toBeInTheDocument();
  });

  it('says so when recent recordings cannot be checked', async () => {
    const { client } = fakeClient({ clipsError: new Error('boom') });
    await importTyped(client);
    expect(await screen.findByText('Could not check recent recordings.')).toBeInTheDocument();
  });

  it('re-importing a kept key neither offers nor claims "Only for now"', async () => {
    const { client } = fakeClient({ stored: true });
    await importTyped(client);
    expect(await screen.findByText('Kept on this phone.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Only for now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Keep it on this phone' })).toBeNull();
    expect(screen.queryByText(/Only for now/)).toBeNull();
  });

  it('key seals carry no recording-integrity name', async () => {
    const { client } = fakeClient({ clips: clipsAt(OTHER_ID) });
    await importTyped(client);
    await screen.findByRole('alert');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByLabelText('Encrypted recording verified')).toBeNull();
    expect(document.body.innerHTML).not.toContain('Encrypted recording verified');
    expect(document.body.innerHTML).not.toContain('Metadata mismatch');
  });
});
