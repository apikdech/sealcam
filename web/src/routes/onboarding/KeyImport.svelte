<script lang="ts">
  import { tick } from 'svelte';
  import { fitWithin } from '../../lib/qr/scale';
  import { createDecoder, type Camera, type Decoder, type Frame } from '../../lib/qr/scan';
  import Seal from '../../lib/seal/Seal.svelte';
  import { workerClient } from '../../lib/workerClient';
  import type { ImportResult, KeyListResult, Request } from '../../worker/protocol';
  import { checkKeyInput, fingerprint } from './keyInput';
  import { keyMismatch, type ClipKeyRef, type Mismatch } from './mismatch';
  import Scanner from './Scanner.svelte';

  interface Props {
    /** The crypto worker; keys never leave it. */
    client?: { call<T = unknown>(msg: Request): Promise<T> };
    now?: () => number;
    /** Test hooks for the QR scanner and the photo decoder. */
    scanner?: {
      open?: () => Promise<Camera>;
      decode?: Decoder;
      wait?: (ms: number) => Promise<void>;
      frame?: (file: File) => Promise<Frame>;
    };
    /** Called once a key is in the worker. */
    onImported?: (keyId: string) => void;
    /** Called after the keyring changed here (remember, remove). */
    onChange?: () => void;
  }

  let { client = workerClient, now = Date.now, scanner = {}, onImported, onChange }: Props = $props();

  const DAY_MS = 86_400_000;

  let text = $state('');
  let show = $state(true);
  let scanning = $state(false);
  let importError = $state('');
  let photoError = $state('');
  let imported: string | null = $state(null);
  let check: '' | 'checking' | 'failed' | 'rejected' | 'matches' = $state('');
  let mismatch: Mismatch | null = $state(null);
  let choice: '' | 'kept' | 'session' = $state('');
  let panelError = $state('');
  let heading: HTMLHeadingElement | undefined = $state();
  let checkSeq = 0;

  const input = $derived(checkKeyInput(text));
  const message = $derived(
    input === 'typo'
      ? 'typo in key. Copy it again or scan the QR code.'
      : input === 'format'
        ? 'Not a complete key yet.'
        : input === 'valid'
          ? 'Key looks right.'
          : '',
  );

  async function checkRecordings(keyId: string) {
    const seq = ++checkSeq;
    mismatch = null;
    check = 'checking';
    try {
      const t = now();
      const res = await client.call<{ clips: ClipKeyRef[] }>({
        type: 'api.get',
        path: '/api/v1/clips',
        query: { from: new Date(t - 7 * DAY_MS).toISOString(), to: new Date(t + 3_600_000).toISOString() },
      });
      if (seq !== checkSeq) return;
      mismatch = keyMismatch(res.clips, keyId);
      check = mismatch ? '' : 'matches';
    } catch (e) {
      if (seq !== checkSeq) return;
      // 401: the server did not accept the Bearer derived from this key. 429
      // means the same: the server never refuses a valid credential, it only
      // rate-limits failed ones, so this key failed too.
      const status = (e as { status?: number } | null)?.status;
      check = status === 401 || status === 429 ? 'rejected' : 'failed';
    }
  }

  async function doImport(encoded: string) {
    importError = '';
    photoError = '';
    try {
      const res = await client.call<ImportResult>({ type: 'key.import', encoded, remember: false });
      if ('error' in res) {
        importError = res.error === 'checksum' ? 'typo in key. Copy it again or scan the QR code.' : 'Not a complete key.';
        return;
      }
      text = ''; // the key text must not linger in the page
      imported = res.keyId;
      choice = '';
      try {
        // An already-kept key stays kept: importing never removes it from storage.
        const list = await client.call<KeyListResult>({ type: 'key.list' });
        if (list.keys.some((k) => k.keyId === res.keyId && k.remembered)) choice = 'kept';
      } catch {
        // unknown: offer the choice
      }
      panelError = '';
      onImported?.(res.keyId);
      void checkRecordings(res.keyId);
      await tick();
      heading?.focus({ preventScroll: true });
    } catch {
      importError = 'Could not import the key. Try again.'; // fixed text: never the key or the raw error
    }
  }

  async function keep() {
    if (!imported) return;
    panelError = '';
    try {
      await client.call({ type: 'key.remember', keyId: imported });
      choice = 'kept';
      onChange?.();
    } catch {
      panelError = 'Could not keep the key on this phone. Try again.';
    }
  }

  async function remove() {
    if (!imported) return;
    panelError = '';
    try {
      await client.call({ type: 'key.forget', keyId: imported });
      checkSeq++;
      imported = null;
      mismatch = null;
      check = '';
      onChange?.();
    } catch {
      panelError = 'Could not remove the key. Try again.';
    }
  }

  function onScanned(scanned: string) {
    scanning = false;
    void doImport(scanned);
  }

  /** Long-side cap for photo decoding: bounds memory and stays under iOS canvas limits. */
  const MAX_PHOTO_SIDE = 1600;

  async function frameFromFile(file: File): Promise<Frame> {
    const probe = await createImageBitmap(file);
    const { width, height } = fitWithin(probe.width, probe.height, MAX_PHOTO_SIDE);
    const scaled = width === probe.width && height === probe.height;
    const bitmap = scaled ? probe : await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    if (!scaled) probe.close();
    const canvas = document.createElement('canvas');
    try {
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.drawImage(bitmap, 0, 0);
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
      canvas.width = canvas.height = 0; // release the backing store
    }
  }

  async function onPhoto(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    photoError = '';
    let found: string | null;
    try {
      found = await (scanner.decode ?? (photoDecoder ??= createDecoder()))(await (scanner.frame ?? frameFromFile)(file));
    } catch {
      found = null;
    }
    if (found === null) {
      photoError = 'No QR code found in that photo.';
      return;
    }
    await doImport(found);
  }
  let photoDecoder: Decoder | undefined;

  const primary = 'bg-line text-ground font-semibold';
  const secondary = 'border border-rule text-ink';
  const btn = 'inline-flex min-h-11 items-center justify-center rounded px-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line';
</script>

<div class="space-y-4">
  <form
    class="space-y-3"
    onsubmit={(e) => {
      e.preventDefault(); // a native submit would put the key in the URL
      if (input === 'valid') void doImport(text);
    }}
  >
    <div class="flex items-end justify-between gap-3">
      <label class="font-semibold" for="family-key">Family key</label>
      <button type="button" class="min-h-11 px-2 text-line underline" aria-pressed={!show} onclick={() => (show = !show)}
        >{show ? 'Hide' : 'Show'}</button
      >
    </div>
    <input
      id="family-key"
      type={show ? 'text' : 'password'}
      class="w-full rounded border border-rule bg-plate p-3 font-mono text-base text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-line"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      placeholder="zk1-…"
      aria-invalid={input === 'typo' ? 'true' : undefined}
      aria-describedby={message ? 'family-key-msg' : undefined}
      bind:value={text}
    />
    <div aria-live="polite" class="min-h-6">
      {#if message}
        <p id="family-key-msg" class={input === 'typo' ? 'text-void' : input === 'valid' ? 'text-line' : 'text-muted'}>{message}</p>
      {/if}
    </div>
    {#if importError}
      <p role="alert" class="text-void">{importError}</p>
    {/if}

    <div class="flex gap-3 max-md:flex-col">
      <button type="button" class="{btn} max-md:order-1 md:order-2 max-md:bg-line max-md:font-semibold max-md:text-ground md:border md:border-rule md:text-ink" onclick={() => (scanning = true)}>Scan QR code</button>
      <button
        type="submit"
        class="{btn} max-md:order-2 md:order-1 max-md:border max-md:border-rule max-md:text-ink md:bg-line md:font-semibold md:text-ground disabled:opacity-40"
        disabled={input !== 'valid'}>Add key</button
      >
    </div>
    <label class="{btn} {secondary} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-line">
      <span>Use a photo of the QR code</span>
      <input type="file" accept="image/*" class="sr-only" aria-label="Use a photo of the QR code" onchange={onPhoto} />
    </label>
    {#if photoError}
      <p role="alert" class="text-amber">{photoError}</p>
    {/if}
  </form>

  {#if scanning}
    <Scanner open={scanner.open} decode={scanner.decode} wait={scanner.wait} onDecoded={onScanned} onClose={() => (scanning = false)} />
  {/if}

  {#if imported}
    <section role="status" class="space-y-4 border-t border-rule pt-4">
      <h2 bind:this={heading} tabindex="-1" class="text-xl font-semibold">Key added</h2>
      <div class="flex items-center gap-3">
        <Seal seed={imported} state="verified" size={64} decorative />
        <p class="num">Fingerprint {fingerprint(imported)}</p>
      </div>

      {#if check === 'checking'}
        <p class="text-muted">Checking recent recordings…</p>
      {:else if check === 'matches'}
        <p class="text-line">Matches recent recordings.</p>
      {:else if check === 'failed'}
        <p class="text-muted">Could not check recent recordings.</p>
      {/if}
    </section>
    {#if mismatch}
      <div role="alert" class="space-y-3 border-l-2 border-amber pl-3">
        <p class="font-semibold text-amber">This key doesn't match recent recordings</p>
        <div class="flex items-center gap-3">
          <Seal seed={mismatch.keyId} state="mismatch" size={40} decorative />
          <p class="num">This key: {fingerprint(mismatch.keyId)}</p>
        </div>
        {#each mismatch.clipKeyIds as id (id)}
          <div class="flex items-center gap-3">
            <Seal seed={id} state="unknown-key" size={40} decorative />
            <p class="num">Recordings use: {fingerprint(id)}</p>
          </div>
        {/each}
        <button type="button" class="{btn} {secondary}" onclick={() => void remove()}>Remove this key</button>
      </div>
    {:else if check === 'rejected'}
      <div role="alert" class="space-y-3 border-l-2 border-amber pl-3">
        <p class="font-semibold text-amber">The server did not accept this key.</p>
        <button type="button" class="{btn} {secondary}" onclick={() => void remove()}>Remove this key</button>
      </div>
    {/if}

    <div class="space-y-3">
      {#if choice === 'kept'}
        <p class="text-line">Kept on this phone.</p>
      {:else if choice === 'session'}
        <p class="text-muted">Only for now. You will add the key again next time.</p>
      {:else}
        <p class="font-semibold">Keep the key on this phone?</p>
        <div class="flex gap-3 max-md:flex-col">
          <button type="button" class="{btn} {secondary}" onclick={() => void keep()}>Keep it on this phone</button>
          <button type="button" class="{btn} {secondary}" onclick={() => (choice = 'session')}>Only for now</button>
        </div>
      {/if}
      {#if panelError}
        <p role="alert" class="text-void">{panelError}</p>
      {/if}
    </div>
    <a href="#/" class="{btn} {primary} no-underline">Open Home</a>
  {/if}
</div>
