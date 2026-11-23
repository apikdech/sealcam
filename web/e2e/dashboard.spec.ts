import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createServer, type ViteDevServer } from 'vite';

// The Watch screen in a real browser engine: the fixed layout (desktop and phone),
// the paged list, keyboard shortcuts, the top bar and the recorder status pill.
const webRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

let server: ViteDevServer;
let cacheDir: string;
let origin: string;

test.beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), 'zview-vite-'));
  server = await createServer({
    configFile: webRoot + 'vite.config.ts',
    root: webRoot,
    logLevel: 'warn',
    cacheDir,
    // Ephemeral port: never a fixed one, many test runs share this machine.
    server: { host: '127.0.0.1', port: 0, strictPort: false, fs: { allow: [repoRoot] } },
  });
  await server.listen();
  origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
});

const url = (q = '') => `${origin}/e2e/page/dashboard.html${q}`;
// The whole app over the same canned API, at the fixed "now" (2026-11-06 15:00 UTC) and zone.
const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);
async function openShell(page: Page, q = '') {
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => localStorage.setItem('zview.zone', 'Asia/Jakarta'));
  await page.goto(`${origin}/e2e/page/dashboard.html?shell${q}#/`);
  await expect(page.getByTestId('stage')).toBeVisible();
}
const recordings = (page: Page) => page.getByRole('listbox', { name: /recordings/i });
const noScroll = (page: Page) =>
  page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows a bounded page of a long list, newest first, in the side column', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url());
    const list = recordings(page);
    await expect(list.getByRole('option').first()).toBeVisible();
    // 400 recordings, 50 rows in the DOM; "Show 50 more" adds one page.
    expect(await list.getByRole('option').count()).toBe(50);
    // Newest first: the last clip of the day (index 399) leads.
    await expect(list.getByRole('option').first()).toHaveAttribute('data-clip', /399$/);
    await page.getByRole('button', { name: 'Show 50 more' }).click();
    expect(await list.getByRole('option').count()).toBe(100);
    const [t, l] = await Promise.all([page.locator('canvas').first().boundingBox(), list.boundingBox()]);
    expect(l!.x).toBeGreaterThan(t!.x + t!.width - 1); // the day's list sits to the right of the timeline
    expect(errors).toEqual([]);
  });

  test('J and K walk the clips', async ({ page }) => {
    await page.goto(url());
    const list = recordings(page);
    await expect(list.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('k');
    const sel = list.getByRole('option', { selected: true });
    await expect(sel).toHaveAttribute('data-clip', /399$/);
    await page.keyboard.press('j');
    await expect(sel).toHaveAttribute('data-clip', /398$/);
  });

  test('the recorder status pill is red for a 4-minute-old status', async ({ page }) => {
    await openShell(page);
    await expect(page.getByTestId('relay-status')).toHaveAttribute('data-level', 'bad');
  });

  test('a selection far down the list scrolls into view', async ({ page }) => {
    await page.goto(url());
    const list = recordings(page);
    await expect(list.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('k');
    for (let i = 0; i < 30; i++) await page.keyboard.press('j');
    await expect(list.getByRole('option', { selected: true })).toBeInViewport();
  });

  test('one top bar: no tabs; the key menu offers Lock now and Manage keys', async ({ page }) => {
    await openShell(page);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^(Home|Timeline|Keys)$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Theme: / })).toBeVisible();
    await page.getByRole('button', { name: 'Key and lock' }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Lock now', 'Manage keys']);
    await menu.getByRole('menuitem', { name: 'Manage keys' }).click();
    await expect(page).toHaveURL(/#\/key$/);
  });

  test('a clip plays with the Recording badge and its trigger chips; the Live pill goes back to live', async ({ page }) => {
    await page.goto(url());
    const stage = page.getByTestId('stage');
    await expect(stage.getByTestId('live-grid')).toBeVisible();
    await expect(stage.getByRole('button', { name: 'Back to live' })).toHaveCount(0);
    await recordings(page).getByRole('option').first().click();
    const badge = stage.getByTestId('badge');
    await expect(badge).toContainText('Recording · Front Door');
    await expect(badge.getByRole('img', { name: 'Person' })).toBeVisible();
    await expect(recordings(page).getByRole('option', { selected: true })).toHaveAttribute('data-clip', /399$/);
    await stage.getByRole('button', { name: 'Back to live' }).click();
    await expect(stage.getByTestId('live-grid')).toBeVisible();
    await expect(recordings(page).getByRole('option', { selected: true })).toHaveCount(0);
  });

  test('the trigger chips filter the list', async ({ page }) => {
    await page.goto(url());
    const chips = page.getByRole('group', { name: 'Filter by trigger' });
    await expect(chips.getByRole('button')).toHaveText(['All', /Person/, /Vehicle/, /Pet/, /Motion/]);
    await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    await expect(recordings(page).getByRole('option').first()).toBeVisible();
    // The relay filters: the chips ask for the chosen triggers (several at once), All asks for every clip.
    const lastTrigger = () =>
      page.evaluate(() => {
        const calls = (window as unknown as { __calls: { type: string; path?: string; query?: Record<string, unknown> }[] }).__calls;
        const t = calls.filter((c) => c.type === 'api.get' && c.path === '/api/v1/clips').at(-1)?.query?.trigger as string[] | undefined;
        return t ? [...t].sort() : null;
      });
    await chips.getByRole('button', { name: /Vehicle/ }).click();
    await chips.getByRole('button', { name: /Person/ }).click();
    await expect(chips.getByRole('button', { name: /Vehicle/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(lastTrigger).toEqual(['person', 'vehicle']);
    await chips.getByRole('button', { name: 'All' }).click();
    await expect.poll(lastTrigger).toBeNull();
    await expect(recordings(page).getByRole('option')).toHaveCount(50);
  });

  test('a grid tile in full screen fills the screen with its picture', async ({ page }) => {
    await openShell(page, '&cams=2');
    const tile = page.getByTestId('live-tile').first();
    await expect(page.getByTestId('live-tile')).toHaveCount(2);
    // A live tile's own button calls the same API; the canned API never goes live.
    await tile.evaluate((el) => el.requestFullscreen());
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid'))).toBe('live-tile');
    // The whole screen height, less the tile's 1 px border.
    const vh = await page.evaluate(() => innerHeight);
    await expect.poll(async () => (await tile.locator('video').boundingBox())!.height).toBeGreaterThanOrEqual(vh - 2);
    await page.evaluate(() => document.exitFullscreen());
  });
});

test.describe('fixed layout', () => {
  for (const [w, h] of [
    [1440, 900],
    [1280, 720],
    [390, 844],
    [844, 390],
  ] as const) {
    test(`the page does not scroll at ${w}×${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openShell(page);
      await expect(recordings(page).getByRole('option').first()).toBeVisible();
      const { sh, ih, sw, iw } = await noScroll(page);
      expect(sh).toBeLessThanOrEqual(ih);
      expect(sw).toBeLessThanOrEqual(iw);
    });
  }

  for (const [w, h] of [
    [390, 844],
    [375, 667],
  ] as const) {
    test(`a past day and a playing clip do not scroll the page at ${w}×${h}, and the list keeps three rows`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(url());
      const rows = recordings(page).getByRole('option');
      await expect(rows.first()).toBeVisible();
      const check = async () => {
        const { sh, ih } = await noScroll(page);
        expect(sh).toBeLessThanOrEqual(ih);
        const scroller = (await recordings(page).locator('xpath=..').boundingBox())!;
        expect(scroller.height).toBeGreaterThanOrEqual(3 * 64 - 1);
        expect(scroller.y + scroller.height).toBeLessThanOrEqual(h + 1);
      };
      // Live (today), then a playing clip, then the past-day prompt.
      await check();
      await rows.first().click();
      await expect(page.getByTestId('badge')).toBeVisible();
      await check();
      await page.getByRole('button', { name: 'Previous day' }).click();
      await expect(page.getByText('Pick an event or a time on the timeline')).toBeVisible();
      await check();
    });
  }

  test('on a phone the video stays in view after scrolling the list', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShell(page);
    const list = recordings(page);
    await expect(list.getByRole('option').first()).toBeVisible();
    const scroller = list.locator('xpath=..');
    await scroller.hover();
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 2000);
    await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByRole('button', { name: 'Show 50 more' })).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const s = (await page.getByTestId('stage').boundingBox())!;
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThan(100);
  });

  test('a long camera name does not run under the Live pill on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url('?long'));
    await recordings(page).getByRole('option').first().click();
    const badge = page.getByTestId('badge');
    await expect(badge).toContainText('Front Door and the Path');
    const [b, p] = await Promise.all([badge.boundingBox(), page.getByRole('button', { name: 'Back to live' }).boundingBox()]);
    const apart = b!.x + b!.width <= p!.x || p!.x + p!.width <= b!.x || b!.y + b!.height <= p!.y || p!.y + p!.height <= b!.y;
    expect(apart).toBe(true);
  });

  test('the compact player bar keeps its controls on one row at 390×844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(url());
    await recordings(page).getByRole('option').first().click();
    const bar = page.getByRole('group', { name: 'Player controls' });
    await expect(bar.getByRole('button', { name: 'Full screen' })).toBeVisible();
    await expect(bar.getByRole('button', { name: 'Back 10 seconds' })).toHaveCount(0);
    const boxes = await bar.evaluate((el) =>
      [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ top: r.top, bottom: r.bottom, right: r.right })),
    );
    expect(boxes.length).toBeGreaterThanOrEqual(6);
    // One row: every control overlaps every other vertically, and none runs off the right edge.
    const lowestTop = Math.max(...boxes.map((r) => r.top));
    const highestBottom = Math.min(...boxes.map((r) => r.bottom));
    expect(lowestTop).toBeLessThan(highestBottom);
    for (const r of boxes) expect(r.right).toBeLessThanOrEqual(390);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('one top bar with no tab bar; the list scrolls in its own area under a pinned stage', async ({ page }) => {
    await openShell(page);
    // No bottom tab bar and no tab links.
    await expect(page.locator('nav')).toHaveCount(0);
    const header = page.getByTestId('watch').locator('> div').first();
    await expect(header.getByTestId('relay-status')).toBeVisible();
    await expect(header.getByRole('button', { name: /^Theme: / })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Key and lock' })).toBeVisible();
    // The camera filter is not in the top bar with one camera.
    await expect(page.getByLabel('Camera')).toHaveCount(0);

    // The trigger chips stay on one line.
    const chips = page.getByRole('group', { name: 'Filter by trigger' }).getByRole('button');
    const tops = await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
    expect(new Set(tops).size).toBe(1);

    // The rows are the only scrolling area.
    const list = recordings(page);
    await expect(list.getByRole('option').first()).toBeVisible();
    expect(await list.locator('xpath=..').evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
    const more = page.getByRole('button', { name: 'Show 50 more' });
    await more.scrollIntoViewIfNeeded();
    await expect(more).toBeInViewport();
    // Bounded DOM, no page scroll either way.
    expect(await list.getByRole('option').count()).toBe(50);
    const { sh, ih, sw, iw } = await noScroll(page);
    expect(sh).toBeLessThanOrEqual(ih);
    expect(sw).toBeLessThanOrEqual(iw);
  });
});
