<script lang="ts">
  import Onboarding from './routes/onboarding/Onboarding.svelte';
  import FirstRun from './routes/onboarding/FirstRun.svelte';
  import Watch from './routes/watch/Watch.svelte';
  import DemoPage from './routes/demo/+page.svelte';
  import KeyMenu from './lib/components/KeyMenu.svelte';
  import ThemeButton from './lib/theme/ThemeButton.svelte';
  import StatusPill from './lib/components/StatusPill.svelte';
  import UpdatePrompt from './lib/pwa/UpdatePrompt.svelte';
  import type { Updater } from './lib/pwa/update';
  import { createViewEnv } from './lib/dashboard/dayData.svelte';
  import { browserZone } from './lib/timeline/timezone';
  import { loadZonePref, ZONE_EVENT } from './lib/timeline/zonePref';
  import { onMount } from 'svelte';
  import { workerClient } from './lib/workerClient';
  import { acquireIdleLock, type LockClient } from './routes/onboarding/idleService';
  import { lockedNotice } from './routes/onboarding/lockNotice';
  import type { KeyListResult } from './worker/protocol';
  import type { Status } from './worker/schemas';

  /** The service worker's update state; null where there is no service worker. */
  let { updater = null, client = workerClient }: { updater?: Updater | null; client?: LockClient } = $props();

  const STATUS_EVERY_MS = 60_000;
  const KEYS_HANG_MS = 5_000;

  // Views: the Watch screen is the default (`#/live` and `#/timeline` are its old names).
  // `#/demo?clip=<id>` is the playback engine's test page (used by e2e).
  type Hash = '#/' | '#/key' | '#/demo';

  /** The route part of the hash, without its query. */
  const route = (): Hash => {
    const r = location.hash.split('?')[0];
    return r === '#/demo' || r === '#/key' ? r : '#/';
  };
  const clip = (): string => new URLSearchParams(location.hash.split('?')[1] ?? '').get('clip') ?? '';

  let hash: Hash = $state(route());
  let clipId = $state(clip());

  // null until the first key.list answers, so FirstRun never flashes for a device that has a key.
  let keys = $state<KeyListResult['keys'] | null>(null);
  /** FirstRun stays up after an import: the "keep it on this phone" choice comes after onImported. */
  let holdFirstRun = $state(false);
  let status: Status | null = $state(null);
  let notice = $state('');
  let lockFailed = $state(false);
  /** key.list failed or hung: say so instead of guessing there is no key. */
  let keysFailed = $state(false);

  const env = createViewEnv();
  // The display zone follows the Timeline's zone picker.
  let zone = $state(loadZonePref() ?? browserZone());
  const syncZone = () => (zone = loadZonePref() ?? browserZone());
  const hasKey = $derived((keys?.length ?? 0) > 0);
  const showFirstRun = $derived(keys !== null && (keys.length === 0 || holdFirstRun));
  /** The Watch screen owns its top bar and the notices row under it. */
  const watching = $derived(hash === '#/' && keys !== null && !showFirstRun);

  async function refreshKeys(result?: KeyListResult) {
    if (result) {
      keys = result.keys;
      keysFailed = false;
      return;
    }
    let hang: ReturnType<typeof setTimeout> | undefined;
    try {
      const answer = await Promise.race([
        client.call<KeyListResult>({ type: 'key.list' }),
        new Promise<never>((_, reject) => {
          hang = setTimeout(() => reject(new Error('key.list timed out')), KEYS_HANG_MS);
        }),
      ]);
      keys = answer.keys;
      keysFailed = false;
    } catch {
      // A key that cannot be read is not a missing key: keep what we knew and say so.
      keysFailed = true;
    } finally {
      clearTimeout(hang);
    }
  }

  async function pollStatus() {
    try {
      status = await client.call<Status>({ type: 'api.get', path: '/api/v1/status', query: {} });
    } catch {
      status = null;
    }
  }

  async function leaveFirstRun() {
    // Every route (and Open Home) starts at the top bar, status and day row.
    window.scrollTo(0, 0);
    holdFirstRun = false;
    await refreshKeys();
    if (hasKey) void pollStatus();
  }

  async function lock() {
    lockFailed = false;
    notice = '';
    try {
      const result = await client.call<KeyListResult>({ type: 'key.lock' });
      await refreshKeys(result);
      notice = lockedNotice(result);
    } catch {
      lockFailed = true;
    }
  }

  onMount(() => {
    // Idle auto-lock (ui-spec §4.1) applies on every view, not only the Keys page.
    const idle = acquireIdleLock(client, {
      onLocked: (result) => {
        void refreshKeys(result);
        // On the Keys page its own notice says it.
        if (hash !== '#/key') notice = lockedNotice(result);
      },
    });
    void refreshKeys().then(() => {
      if (hasKey) void pollStatus();
    });
    const poll = setInterval(() => {
      if (hasKey) void pollStatus();
    }, STATUS_EVERY_MS);
    window.addEventListener(ZONE_EVENT, syncZone);
    return () => {
      window.removeEventListener(ZONE_EVENT, syncZone);
      clearInterval(poll);
      idle.release();
    };
  });

  const tabBase = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-line';
</script>

<svelte:window
  onhashchange={() => {
    hash = route();
    clipId = clip();
    syncZone();
    notice = '';
    lockFailed = false;
    void leaveFirstRun();
  }}
/>

{#snippet barEnd()}
  <StatusPill {status} nowMs={env.wall} {zone} />
  <ThemeButton />
  <KeyMenu canLock={hasKey} onLock={() => void lock()} />
{/snippet}

{#snippet notices()}
  <UpdatePrompt {updater} />
  {#if notice}
    <p role="status" class="border-b border-rule bg-plate px-4 py-2 text-sm">{notice}</p>
  {/if}
  {#if lockFailed}
    <p role="alert" class="border-b border-rule bg-plate px-4 py-2 text-sm text-void">Could not lock. Try again.</p>
  {/if}
{/snippet}

{#if !watching}
  <header class="flex items-center gap-4 border-b border-rule bg-ground px-4">
    <p class="py-2 text-xl font-semibold tracking-wide"><span class="text-ink">z</span><span class="text-line">view</span></p>
    <div class="ml-auto flex items-center">{@render barEnd()}</div>
  </header>
  {@render notices()}
{/if}

<div>
  {#if hash === '#/demo'}
    <DemoPage {clipId} />
  {:else if hash === '#/key'}
    <Onboarding />
  {:else if keys === null && keysFailed}
    <main class="mx-auto max-w-xl space-y-3 p-4">
      <p role="alert" class="text-void">Could not read the keys on this device.</p>
      <button
        type="button"
        class="{tabBase} inline-flex min-h-11 items-center rounded border border-rule px-4 text-ink"
        onclick={() => void refreshKeys()}>Try again</button
      >
    </main>
  {:else if keys === null}
    <!-- waiting for the first key.list -->
  {:else if showFirstRun}
    <!-- The link to Home may point at the hash we are on (no hashchange), so catch its click too. -->
    <div
      role="presentation"
      onclick={(e) => {
        if ((e.target as Element).closest('a[href="#/"]')) void leaveFirstRun();
      }}
    >
      <FirstRun
        {client}
        onImported={() => {
          holdFirstRun = true;
          notice = '';
        }}
      />
    </div>
  {:else}
    <Watch {client} {status} topRight={barEnd} {notices} />
  {/if}
</div>
