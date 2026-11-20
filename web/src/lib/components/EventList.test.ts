// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventList from './EventList.svelte';

afterEach(cleanup);

const row = (i: number, over: Record<string, unknown> = {}) => ({
  id: `id${i}`,
  cameraName: 'Front Door',
  startMs: Date.UTC(2026, 10, 6, 0, 0, 0) + i * 60_000,
  durationMs: 65_000 as number | null,
  triggers: ['person', 'vehicle'],
  status: 'complete' as const,
  ...over,
});

const base = { selectedId: null, zone: 'UTC', integrity: {}, onSelect: () => {} };
const many = (n: number) => Array.from({ length: n }, (_, i) => row(n - i));

describe('EventList', () => {
  it('renders at most 50 options for 2000 clips and a Show 50 more button', () => {
    render(EventList, { ...base, clips: many(2000) });
    expect(screen.getAllByRole('option')).toHaveLength(50);
    expect(screen.getByText('Showing 50 of 2000')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show 50 more' })).toBeInTheDocument();
  });

  it('Show 50 more adds 50', async () => {
    render(EventList, { ...base, clips: many(120) });
    await fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.getByText('Showing 100 of 120')).toBeInTheDocument();
  });

  it('hides the button when everything is shown', () => {
    render(EventList, { ...base, clips: many(3) });
    expect(screen.queryByRole('button', { name: /show .* more/i })).toBeNull();
  });

  it('the first row is tabbable when nothing is selected', () => {
    render(EventList, { ...base, clips: many(3) });
    const rows = screen.getAllByRole('option');
    expect(rows.map((r) => r.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('the selected row is the tab stop', () => {
    render(EventList, { ...base, clips: many(3), selectedId: 'id1' });
    expect(screen.getByRole('option', { selected: true })).toHaveAttribute('tabindex', '0');
  });

  it('ArrowDown moves focus to the next row', async () => {
    render(EventList, { ...base, clips: many(3) });
    const rows = screen.getAllByRole('option');
    rows[0]!.focus();
    await fireEvent.keyDown(rows[0]!, { key: 'ArrowDown' });
    expect(rows[1]).toHaveFocus();
    await fireEvent.keyDown(rows[1]!, { key: 'ArrowUp' });
    expect(rows[0]).toHaveFocus();
  });

  it('End focuses the last rendered row, Home the first', async () => {
    render(EventList, { ...base, clips: many(120) });
    const rows = screen.getAllByRole('option');
    rows[0]!.focus();
    await fireEvent.keyDown(rows[0]!, { key: 'End' });
    expect(rows[49]).toHaveFocus();
    await fireEvent.keyDown(rows[49]!, { key: 'Home' });
    expect(rows[0]).toHaveFocus();
  });

  it('Enter and Space select', async () => {
    const onSelect = vi.fn();
    render(EventList, { ...base, clips: many(2), onSelect });
    const [a, b] = screen.getAllByRole('option');
    await fireEvent.keyDown(a!, { key: 'Enter' });
    await fireEvent.keyDown(b!, { key: ' ' });
    expect(onSelect.mock.calls).toEqual([['id2'], ['id1']]);
  });

  it('marks the selection and calls onSelect on click', async () => {
    const onSelect = vi.fn();
    render(EventList, { ...base, clips: [row(1), row(0)], selectedId: 'id0', onSelect });
    const [a, b] = screen.getAllByRole('option');
    expect(a).toHaveAttribute('aria-selected', 'false');
    expect(b).toHaveAttribute('aria-selected', 'true');
    await fireEvent.click(a!);
    expect(onSelect).toHaveBeenCalledWith('id1');
  });

  it('a row without integrity shows the unchecked seal', () => {
    render(EventList, { ...base, clips: [row(0)] });
    expect(screen.getByRole('option').querySelector('[data-seal-state="unchecked"]')).not.toBeNull();
  });

  it('a known integrity state shows its seal', () => {
    render(EventList, { ...base, clips: [row(0)], integrity: { id0: 'verified' } });
    expect(screen.getByRole('option').querySelector('[data-seal-state="verified"]')).not.toBeNull();
  });

  it('an incomplete clip shows the incomplete seal', () => {
    render(EventList, { ...base, clips: [row(0, { status: 'incomplete', durationMs: null })] });
    expect(screen.getByRole('option').querySelector('[data-seal-state="incomplete"]')).not.toBeNull();
  });

  it('empty list shows the sentence', () => {
    render(EventList, { ...base, clips: [] });
    expect(screen.getByText('No recordings on this day.')).toBeInTheDocument();
  });

  it('times use the display zone, camera, length and trigger letters', () => {
    render(EventList, { ...base, clips: [row(0)], zone: 'Asia/Jakarta' });
    const r = screen.getByRole('option');
    // 2026-11-06T00:00Z is 07:00 in Jakarta.
    expect(r).toHaveTextContent('07:00');
    expect(r).not.toHaveTextContent('07:00:00');
    expect(r).toHaveTextContent('Front Door');
    expect(r).toHaveTextContent('1:05');
    expect(within(r).getByLabelText('Person')).toHaveTextContent('P');
    expect(within(r).getByLabelText('Vehicle')).toHaveTextContent('V');
  });

  it('is a listbox named Recordings', () => {
    render(EventList, { ...base, clips: many(1) });
    expect(screen.getByRole('listbox', { name: 'Recordings' })).toBeInTheDocument();
  });
});
