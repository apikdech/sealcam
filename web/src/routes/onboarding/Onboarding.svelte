<script lang="ts">
  import { onMount } from 'svelte';
  import type { ComponentProps } from 'svelte';
  import Seal from '../../lib/seal/Seal.svelte';
  import { workerClient } from '../../lib/workerClient';
  import type { KeyListResult } from '../../worker/protocol';
  import { acquireIdleLock, IDLE_CHOICES, savedIdleMinutes, type IdleHandle } from './idleService';
  import { fingerprint } from './keyInput';
  import KeyImport from './KeyImport.svelte';
  import { lockedNotice } from './lockNotice';

  type Props = Pick<ComponentProps<typeof KeyImport>, 'client' | 'now' | 'scanner'>;

  let { client = workerClient, now = Date.now, scanner = {} }: Props = $props();

  let keys: KeyListResult['keys'] = $state([]);
  let notice = $state('');
  let actionError = $state('');
  let confirming: string | null = $state(null);
  /** Bumped to reset the import panel when keys are locked or forgotten. */
  let epoch = $state(0);
  let idleMinutes = $state(savedIdleMinutes());
  let idle: IdleHandle | undefined;

  async function refresh(result?: KeyListResult) {
    keys = (result ?? (await client.call<KeyListResult>({ type: 'key.list' }))).keys;
  }

  async function doLock() {
    actionError = '';
    try {
      const result = await client.call<KeyListResult>({ type: 'key.lock' });
      epoch++;
      await refresh(result);
      notice = lockedNotice(result);
    } catch {
      actionError = 'Could not lock. Try again.';
    }
  }

  async function doForget(keyId: string) {
    actionError = '';
    try {
      await refresh(await client.call<KeyListResult>({ type: 'key.forget', keyId }));
      confirming = null;
      epoch++;
      notice = 'Key removed from this device.';
    } catch {
      actionError = 'Could not forget the key. Try again.';
    }
  }

  function setIdle(e: Event) {
    idleMinutes = Number((e.currentTarget as HTMLSelectElement).value);
    idle?.setMinutes(idleMinutes); // persists, and applies app-wide
  }

  onMount(() => {
    // The lock itself is app-level (App holds it); this page only changes the
    // setting and mirrors an idle lock that happens while it is open.
    idle = acquireIdleLock(client, {
      onLocked: (result) => {
        actionError = '';
        epoch++;
        void refresh(result);
        notice = lockedNotice(result);
      },
      onError: () => {
        actionError = 'Could not lock. Try again.';
      },
    });
    void refresh();
    return () => idle?.release();
  });

  const btn = 'inline-flex min-h-11 items-center justify-center rounded border border-rule px-4 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line';
</script>

<main class="mx-auto max-w-xl space-y-8 p-4">
  <h1 class="text-2xl font-semibold">Keys</h1>

  {#key epoch}
    <KeyImport
      {client}
      {now}
      {scanner}
      onImported={() => {
        notice = '';
        void refresh();
      }}
      onChange={() => void refresh()}
    />
  {/key}

  {#if keys.length > 0}
    <ul aria-label="Keyring" class="divide-y divide-rule border-y border-rule">
      {#each keys as k (k.keyId)}
        <li class="flex flex-wrap items-center gap-3 py-3">
          <Seal seed={k.keyId} state="verified" size={40} decorative />
          <div class="min-w-0 flex-1">
            <p class="num">{fingerprint(k.keyId)}</p>
            <p class="text-sm text-muted">{k.remembered ? 'Kept on this phone' : 'Only for now'}</p>
          </div>
          {#if confirming !== k.keyId}
            <button
              type="button"
              class="{btn} ml-auto"
              aria-label="Forget key {fingerprint(k.keyId)} on this device"
              onclick={() => (confirming = k.keyId)}>Forget</button
            >
          {:else}
            <div class="w-full space-y-3">
              <p>Forget this key on this device? You need the QR code or key text to add it again.</p>
              <div class="flex gap-3">
                <button type="button" class="{btn} border-void text-void" onclick={() => void doForget(k.keyId)}>Forget key</button>
                <button type="button" class={btn} onclick={() => (confirming = null)}>Cancel</button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <section class="space-y-3" aria-labelledby="lock-heading">
    <h2 id="lock-heading" class="text-xl font-semibold">Lock</h2>
    <button type="button" class={btn} disabled={keys.length === 0} onclick={() => void doLock()}>Lock now</button>
    {#if notice}
      <p role="status">{notice}</p>
    {/if}
    {#if actionError}
      <p role="alert" class="text-void">{actionError}</p>
    {/if}
    <label class="flex flex-wrap items-center gap-3">
      <span>Lock when Sealcam is in the background</span>
      <select class="min-h-11 rounded border border-rule bg-plate px-2 text-base text-ink" value={String(idleMinutes)} onchange={setIdle}>
        {#each IDLE_CHOICES as m (m)}
          <option value={String(m)}>{m === 0 ? 'Never' : `After ${m} min`}</option>
        {/each}
      </select>
    </label>
  </section>
</main>
