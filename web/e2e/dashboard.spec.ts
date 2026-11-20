import { expect, test, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createServer, type ViteDevServer } from 'vite';

// The timeline page in a real browser engine: layout (desktop and phone),
// the paged list, keyboard shortcuts and the recorder status pill.
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

const url = () => `${origin}/e2e/page/dashboard.html`;
// The whole app over the same canned API, at the fixed "now" (2026-11-06 15:00 UTC) and zone.
const NOW = Date.UTC(2026, 10, 6, 15, 0, 0);
async function openShell(page: Page) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => localStorage.setItem('zview.zone', 'Asia/Jakarta'));
  await page.goto(`${origin}/e2e/page/dashboard.html?shell#/timeline`);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('shows a bounded page of a long list, newest first, in the side column', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url());
    const list = page.getByRole('listbox', { name: /recordings/i });
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
    const list = page.getByRole('listbox', { name: /recordings/i });
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
    const list = page.getByRole('listbox', { name: /recordings/i });
    await expect(list.getByRole('option').first()).toBeVisible();
    await page.keyboard.press('k');
    for (let i = 0; i < 30; i++) await page.keyboard.press('j');
    await expect(list.getByRole('option', { selected: true })).toBeInViewport();
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the bottom tab bar is visible and the list is in page flow', async ({ page }) => {
    await openShell(page);
    const bar = page.locator('nav.fixed');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link')).toHaveText(['Home', 'Timeline', 'Keys']);
    await expect(bar.getByRole('link', { name: 'Timeline' })).toHaveAttribute('aria-current', 'page');
    const b = (await bar.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(64);
    expect(b.y + b.height).toBeCloseTo(844, 0);
    // The top-bar tab links are for desktop only.
    await expect(page.locator('header nav')).toBeHidden();

    // Filters are always visible: no Menu button.
    await expect(page.getByLabel('Camera')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);

    // The list is part of the page: no sheet, no scroll container of its own.
    const list = page.getByRole('listbox', { name: /recordings/i });
    await expect(list.getByRole('option').first()).toBeVisible();
    const holders = await list.evaluate((el) => {
      const out: { position: string; overflowY: string }[] = [];
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        out.push({ position: cs.position, overflowY: cs.overflowY });
      }
      return out;
    });
    for (const h of holders) {
      expect(['fixed', 'absolute']).not.toContain(h.position);
      expect(['auto', 'scroll']).not.toContain(h.overflowY);
    }
    // The page itself scrolls to reach the rest, and the last row is not hidden behind the tab bar.
    const more = page.getByRole('button', { name: 'Show 50 more' });
    await more.scrollIntoViewIfNeeded();
    await expect(more).toBeInViewport();
    const m = (await more.boundingBox())!;
    expect(m.y + m.height).toBeLessThanOrEqual(b.y + 1);
    // Bounded DOM, no horizontal page scroll.
    expect(await list.getByRole('option').count()).toBe(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
