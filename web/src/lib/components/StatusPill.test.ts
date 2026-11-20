// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import type { Status } from '../../worker/schemas';
import StatusPill from './StatusPill.svelte';

const NOW = Date.parse('2026-11-20T14:47:00Z');
const status: Status = {
  schema: 'zrec.status/1',
  relay_id: 'r1',
  version: 'v2',
  updated_at: '2026-11-20T14:46:00Z',
  key_id: '0123456789abcdef',
  cameras: [{ id: 'f', name: 'Front Door', rtsp: 'up', events: 'up', since: '2026-11-20T10:00:00Z', last_clip_at: null }],
};

afterEach(cleanup);

describe('StatusPill', () => {
  it('shows short text and level', () => {
    render(StatusPill, { status, nowMs: NOW, zone: 'Asia/Jakarta' });
    const b = screen.getByTestId('relay-status');
    expect(b.textContent).toContain('Recorder OK');
    expect(b.getAttribute('data-level')).toBe('ok');
  });

  it('toggles details with aria-expanded', async () => {
    render(StatusPill, { status, nowMs: NOW, zone: 'Asia/Jakarta' });
    const b = screen.getByTestId('relay-status');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('The recorder checked in at 21:46.')).toBeNull();
    await fireEvent.click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    const region = document.getElementById(b.getAttribute('aria-controls')!)!;
    expect(region.textContent).toContain('The recorder checked in at 21:46.');
    await fireEvent.click(b);
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape closes', async () => {
    render(StatusPill, { status, nowMs: NOW, zone: 'Asia/Jakarta' });
    const b = screen.getByTestId('relay-status');
    await fireEvent.click(b);
    await fireEvent.keyDown(b, { key: 'Escape' });
    expect(b.getAttribute('aria-expanded')).toBe('false');
  });
});
