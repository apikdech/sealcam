// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request } from './worker/protocol';

// The pages need the worker and the browser APIs; only the shell is under test.
vi.mock('./routes/watch/Watch.svelte', () => import('../test-support/routes/Watch.svelte'));
vi.mock('./routes/demo/+page.svelte', () => import('../test-support/routes/Demo.svelte'));
vi.mock('./routes/onboarding/Onboarding.svelte', () => import('../test-support/routes/Key.svelte'));
vi.mock('./routes/onboarding/FirstRun.svelte', () => import('../test-support/routes/FirstRun.svelte'));

import App from './App.svelte';
import { saveZonePref } from './lib/timeline/zonePref';

const scrollTo = vi.fn();
window.scrollTo = scrollTo as unknown as typeof window.scrollTo;

afterEach(async () => {
  cleanup();
  location.hash = '';
  // jsdom delivers the hashchange for that reset asynchronously; let it pass before the next test renders.
  await new Promise((r) => setTimeout(r, 0));
});

type Keys = { keyId: string; remembered: boolean }[];
const KEY = { keyId: '0123456789abcdef', remembered: true };

/** A worker double: `keys` is what key.list answers; key.lock answers `afterLock`. */
function fake(keys: Keys = [KEY], afterLock: Keys = keys) {
  const calls: Request[] = [];
  return {
    calls,
    async call<T>(msg: Request): Promise<T> {
      calls.push(msg);
      if (msg.type === 'key.list') return { keys } as T;
      if (msg.type === 'key.lock') return { keys: afterLock } as T;
      if (msg.type === 'api.get') throw new Error('no status');
      return undefined as T;
    },
  };
}

const shown = () =>
  ['watch', 'demo', 'key', 'firstrun'].filter((r) => screen.queryByTestId(`route-${r}`) !== null);
const settled = async (route: string) => {
  await screen.findByTestId(`route-${route}`);
  return shown();
};

describe('App routing', () => {
  it('a route change scrolls to the top', async () => {
    location.hash = '';
    render(App, { client: fake() });
    await settled('watch');
    scrollTo.mockClear();
    location.hash = '#/timeline';
    await fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(shown()).toEqual(['watch']));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('default route renders Home', async () => {
    location.hash = '';
    render(App, { client: fake() });
    expect(await settled('watch')).toEqual(['watch']);
  });

  for (const h of ['#/', '#/live', '#/nowhere']) {
    it(`${h} renders Home`, async () => {
      location.hash = h;
      render(App, { client: fake() });
      expect(await settled('watch')).toEqual(['watch']);
    });
  }

  it('shows the timeline for #/timeline', async () => {
    location.hash = '#/timeline';
    render(App, { client: fake() });
    expect(await settled('watch')).toEqual(['watch']);
  });

  it('shows the keys page for #/key', async () => {
    location.hash = '#/key';
    render(App, { client: fake() });
    expect(await settled('key')).toEqual(['key']);
  });

  it('shows the demo page, passing the clip', async () => {
    location.hash = '#/demo?clip=01M6RXRJAQRJY105FSDF0QRBH1';
    render(App, { client: fake() });
    expect(await settled('demo')).toEqual(['demo']);
    expect(screen.getByTestId('route-demo')).toHaveAttribute('data-clip', '01M6RXRJAQRJY105FSDF0QRBH1');
  });

  it('has no Views navigation, on Watch or elsewhere', async () => {
    for (const h of ['#/timeline', '#/key', '#/demo']) {
      location.hash = h;
      const { unmount } = render(App, { client: fake() });
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByRole('navigation', { name: 'Views' })).toBeNull();
      unmount();
    }
  });

  for (const h of ['#/live', '#/timeline']) {
    it(`${h} renders the Watch screen`, async () => {
      location.hash = h;
      render(App, { client: fake() });
      expect(await settled('watch')).toEqual(['watch']);
    });
  }

  it('the theme button is on Watch and on Keys', async () => {
    location.hash = '';
    render(App, { client: fake() });
    await settled('watch');
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
    cleanup();
    location.hash = '#/key';
    render(App, { client: fake() });
    await settled('key');
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });

  it('Manage keys in the key menu goes to #/key', async () => {
    location.hash = '';
    render(App, { client: fake() });
    await settled('watch');
    await fireEvent.click(screen.getByRole('button', { name: 'Key and lock' }));
    expect(screen.getByRole('menuitem', { name: 'Manage keys' })).toHaveAttribute('href', '#/key');
  });

  it('follows hash changes', async () => {
    location.hash = '';
    render(App, { client: fake() });
    expect(await settled('watch')).toEqual(['watch']);
    location.hash = '#/key';
    await fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(shown()).toEqual(['key']));
    location.hash = '#/bogus';
    await fireEvent(window, new HashChangeEvent('hashchange'));
    await waitFor(() => expect(shown()).toEqual(['watch']));
  });
});

describe('App first run and Lock', () => {
  it('no keys renders FirstRun on Home, and #/timeline is Home too', async () => {
    location.hash = '#/timeline';
    render(App, { client: fake([]) });
    expect(await settled('firstrun')).toEqual(['firstrun']);
  });

  it('importing on FirstRun shows Home once the user leaves it; the remember choice stays reachable until then', async () => {
    location.hash = '';
    // jsdom delivers this hashchange asynchronously; let it pass before the shell mounts.
    await new Promise((r) => setTimeout(r, 0));
    let keys: Keys = [];
    const client = {
      async call<T>(msg: Request): Promise<T> {
        if (msg.type === 'key.list') return { keys } as T;
        throw new Error('no status');
      },
    };
    render(App, { client });
    await settled('firstrun');
    keys = [KEY];
    await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
    await new Promise((r) => setTimeout(r, 20));
    expect(shown()).toEqual(['firstrun']);
    expect(screen.getByText(/Keep it on this phone/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('link', { name: 'Open Home' }));
    await waitFor(() => expect(shown()).toEqual(['watch']));
  });

  it('Open Home lands at the top of the page', async () => {
    location.hash = '';
    // jsdom delivers this hashchange asynchronously; let it pass before the shell mounts.
    await new Promise((r) => setTimeout(r, 0));
    let keys: Keys = [];
    const client = {
      async call<T>(msg: Request): Promise<T> {
        if (msg.type === 'key.list') return { keys } as T;
        throw new Error('no status');
      },
    };
    render(App, { client });
    await settled('firstrun');
    keys = [KEY];
    await fireEvent.click(screen.getByRole('button', { name: 'Add key' }));
    await new Promise((r) => setTimeout(r, 20));
    scrollTo.mockClear();
    await fireEvent.click(screen.getByRole('link', { name: 'Open Home' }));
    await waitFor(() => expect(shown()).toEqual(['watch']));
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('Lock shows the result text for a remembered key', async () => {
    render(App, { client: fake([KEY], [KEY]) });
    await settled('watch');
    await fireEvent.click(screen.getByRole('button', { name: 'Key and lock' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Lock now' }));
    expect(await screen.findByText('Locked. Opening a recording unlocks it again on this device.')).toBeInTheDocument();
  });

  it('Lock shows the session-only text when no key is kept', async () => {
    render(App, { client: fake([{ keyId: 'a', remembered: false }], []) });
    await settled('watch');
    await fireEvent.click(screen.getByRole('button', { name: 'Key and lock' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Lock now' }));
    expect(await screen.findByText('Locked. Add the key again to watch.')).toBeInTheDocument();
  });

  it('Lock now is disabled with no key', async () => {
    render(App, { client: fake([]) });
    await settled('firstrun');
    await fireEvent.click(screen.getByRole('button', { name: 'Key and lock' }));
    expect(screen.getByRole('menuitem', { name: 'Lock now' })).toBeDisabled();
  });
});

describe('App recorder status', () => {
  afterEach(() => vi.useRealTimers());

  it('polls /api/v1/status every 60 s and passes it to Home', async () => {
    vi.useFakeTimers();
    const status = { schema: 'zrec.status/1', relay_id: 'r', version: 'v', updated_at: '2026-11-20T10:00:00Z', key_id: 'k', cameras: [] };
    const calls: Request[] = [];
    const client = {
      async call<T>(msg: Request): Promise<T> {
        calls.push(msg);
        if (msg.type === 'key.list') return { keys: [KEY] } as T;
        if (msg.type === 'api.get') return status as T;
        return undefined as T;
      },
    };
    render(App, { client });
    await vi.advanceTimersByTimeAsync(0);
    const polls = () => calls.filter((c) => c.type === 'api.get' && c.path === '/api/v1/status').length;
    expect(polls()).toBe(1);
    expect(screen.getByTestId('route-watch')).toHaveAttribute('data-status', '2026-11-20T10:00:00Z');
    expect(screen.getByTestId('relay-status')).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(polls()).toBe(2);
  });
});

describe('App-level idle auto-lock', () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => {
    setHidden(false);
    localStorage.clear();
    vi.useRealTimers();
  });

  for (const route of ['#/timeline', '#/', '#/demo']) {
    it(`locks the worker from ${route} when the saved idle time passes with the tab hidden`, async () => {
      vi.useFakeTimers();
      localStorage.setItem('zview.idleLockMinutes', '5');
      const client = fake();
      location.hash = route;
      render(App, { client });
      setHidden(true);
      await vi.advanceTimersByTimeAsync(4 * 60_000);
      expect(client.calls.some((c) => c.type === 'key.lock')).toBe(false);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(client.calls.filter((c) => c.type === 'key.lock')).toHaveLength(1);
    });
  }

  it('does not lock when the setting is off', async () => {
    vi.useFakeTimers();
    const client = fake();
    location.hash = '#/timeline';
    render(App, { client });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(client.calls.filter((c) => c.type === 'key.lock')).toEqual([]);
  });
});

describe('App on the Keys page', () => {
  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  afterEach(() => {
    setHidden(false);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('has the key menu on #/key', async () => {
    location.hash = '#/key';
    render(App, { client: fake() });
    await settled('key');
    expect(screen.getByRole('button', { name: 'Key and lock' })).toBeInTheDocument();
  });

  it('an idle lock on #/key adds no shell notice (the Keys page says it)', async () => {
    vi.useFakeTimers();
    localStorage.setItem('zview.idleLockMinutes', '5');
    const client = fake();
    location.hash = '#/key';
    render(App, { client });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(client.calls.filter((c) => c.type === 'key.lock')).toHaveLength(1);
    expect(screen.queryByText(/^Locked\./)).toBeNull();
  });
});

describe('App display zone', () => {
  afterEach(() => localStorage.clear());

  it('the status pill follows a zone change made on the Timeline', async () => {
    saveZonePref('UTC');
    const status = { schema: 'zrec.status/1', relay_id: 'r', version: 'v', updated_at: '2026-11-20T10:00:00Z', key_id: 'k', cameras: [] };
    const client = {
      async call<T>(msg: Request): Promise<T> {
        if (msg.type === 'key.list') return { keys: [KEY] } as T;
        if (msg.type === 'api.get') return status as T;
        return undefined as T;
      },
    };
    location.hash = '#/timeline';
    render(App, { client });
    await settled('watch');
    await waitFor(() => expect(screen.getByTestId('relay-status')).toBeInTheDocument());
    saveZonePref('Asia/Jakarta');
    location.hash = '#/';
    await fireEvent(window, new HashChangeEvent('hashchange'));
    await fireEvent.click(screen.getByTestId('relay-status'));
    expect(await screen.findByText(/17:00/)).toBeInTheDocument();
  });
});

describe('App when the keys cannot be read', () => {
  afterEach(() => vi.useRealTimers());

  it('a rejected key.list shows an alert and Try again, not FirstRun', async () => {
    let fail = true;
    const client = {
      async call<T>(msg: Request): Promise<T> {
        if (msg.type === 'key.list') {
          if (fail) throw new Error('worker down');
          return { keys: [KEY] } as T;
        }
        throw new Error('no status');
      },
    };
    location.hash = '';
    render(App, { client });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the keys on this device.');
    expect(shown()).toEqual([]);
    fail = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await settled('watch')).toEqual(['watch']);
  });

  it('a key.list that never answers shows the same alert after 5 s', async () => {
    vi.useFakeTimers();
    const client = { call: () => new Promise<never>(() => {}) };
    location.hash = '';
    render(App, { client });
    await vi.advanceTimersByTimeAsync(4_900);
    expect(screen.queryByRole('alert')).toBeNull();
    await vi.advanceTimersByTimeAsync(200);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not read the keys on this device.');
    expect(shown()).toEqual([]);
  });
});
