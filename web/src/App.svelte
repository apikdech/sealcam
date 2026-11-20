<script lang="ts">
  import Onboarding from './routes/onboarding/Onboarding.svelte';
  import FirstRun from './routes/onboarding/FirstRun.svelte';
  import HomePage from './routes/home/Home.svelte';
  import TimelinePage from './routes/+page.svelte';
  import DemoPage from './routes/demo/+page.svelte';
  import Icon, { type IconName } from './lib/components/Icon.svelte';
  import StatusPill from './lib/components/StatusPill.svelte';
  import UpdatePrompt from './lib/pwa/UpdatePrompt.svelte';
  import type { Updater } from './lib/pwa/update';
  import { createViewEnv } from './lib/dashboard/dayData.svelte';
  import { browserZone } from './lib/timeline/timezone';
  import { loadZonePref } from './lib/timeline/zonePref';
  import { onMount } from 'svelte';
  import { workerClient } from './lib/workerClient';
  import { acquireIdleLock, type LockClient } from './routes/onboarding/idleService';
  import { lockedNotice } from './routes/onboarding/lockNotice';
  import type { KeyListResult } from './worker/protocol';
  import type { Status } from './worker/schemas';

  /** The service worker's update state; null where there is no service worker. */
  let { updater = null, client = workerClient }: { updater?: Updater | null; client?: LockClient } = $props();

  const STATUS_EVERY_MS = 60_000;

  // Top-level views (design §7.2 as amended): Home is the default; `#/live` is its old name.
  // `#/demo?clip=<id>` is the playback engine's test page (used by e2e); it is not in the nav.
  const tabs: { hash: '#/' | '#/timeline' | '#/key'; label: string; icon: IconName }[] = [
    { hash: '#/', label: 'Home', icon: 'home' },
    { hash: '#/timeline', label: 'Timeline', icon: 'timeline' },
    { hash: '#/key', label: 'Keys', icon: 'key' },
  ];
  type Hash = '#/' | '#/timeline' | '#/key' | '#/demo';

  /** The route part of the hash, without its query. */
  const route = (): Hash => {
    const r = location.hash.split('?')[0];
    return r === '#/timeline' || r === '#/demo' || r === '#/key' ? r : '#/';
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

  const env = createViewEnv();
  const zone = loadZonePref() ?? browserZone();
  const hasKey = $derived((keys?.length ?? 0) > 0);
  const showFirstRun = $derived(keys !== null && (keys.length === 0 || holdFirstRun));

  async function refreshKeys(result?: KeyListResult) {
    try {
      keys = (result ?? (await client.call<KeyListResult>({ type: 'key.list' }))).keys;
    } catch {
      keys ??= [];
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
        notice = lockedNotice(result);
      },
    });
    void refreshKeys().then(() => {
      if (hasKey) void pollStatus();
    });
    const poll = setInterval(() => {
      if (hasKey) void pollStatus();
    }, STATUS_EVERY_MS);
    return () => {
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
    notice = '';
    lockFailed = false;
    void leaveFirstRun();
  }}
/>

<UpdatePrompt {updater} />

<header class="flex items-center gap-4 border-b border-rule bg-ground px-4">
  <p class="text-xl font-semibold tracking-wide" aria-label="zview"><span class="text-ink">z</span><span class="text-line">view</span></p>
  <nav aria-label="Views" class="hidden gap-1 md:flex">
    {#each tabs as t (t.hash)}
      <a
        href={t.hash}
        aria-current={hash === t.hash ? 'page' : undefined}
        class="{tabBase} inline-flex min-h-11 items-center px-3 text-sm {hash === t.hash ? 'text-line underline underline-offset-8' : 'text-muted'}">{t.label}</a
      >
    {/each}
  </nav>
  <div class="ml-auto flex items-center">
    <button
      type="button"
      aria-label="Lock"
      title="Lock"
      disabled={!hasKey}
      class="{tabBase} inline-flex h-11 w-11 items-center justify-center text-ink disabled:opacity-40"
      onclick={() => void lock()}><Icon name="lock" size={22} /></button
    >
    <StatusPill {status} nowMs={env.wall} {zone} />
  </div>
</header>

{#if notice}
  <p role="status" class="border-b border-rule bg-plate px-4 py-2 text-sm">{notice}</p>
{/if}
{#if lockFailed}
  <p role="alert" class="border-b border-rule bg-plate px-4 py-2 text-sm text-void">Could not lock. Try again.</p>
{/if}

<div class="pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
  {#if hash === '#/demo'}
    <DemoPage {clipId} />
  {:else if hash === '#/key'}
    <Onboarding />
  {:else if hash === '#/timeline'}
    <TimelinePage {client} />
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
    <HomePage {client} {status} />
  {/if}
</div>

<nav
  aria-label="Views"
  class="fixed inset-x-0 bottom-0 z-40 box-content grid h-16 grid-cols-3 border-t border-rule bg-plate pb-[env(safe-area-inset-bottom)] md:hidden"
>
  {#each tabs as t (t.hash)}
    <a
      href={t.hash}
      aria-current={hash === t.hash ? 'page' : undefined}
      class="{tabBase} flex flex-col items-center justify-center gap-1 text-xs {hash === t.hash ? 'text-line' : 'text-muted'}"
    >
      <Icon name={t.icon} size={22} />
      <span>{t.label}</span>
    </a>
  {/each}
</nav>
