// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('the listbox holds only options: the footer and the empty note sit outside it', () => {
    const a = render(EventList, { ...base, clips: many(120) });
    const box = screen.getByRole('listbox', { name: 'Recordings' });
    for (const child of Array.from(box.children)) expect(child.getAttribute('role')).toBe('option');
    expect(box).not.toContainElement(screen.getByText('Showing 50 of 120'));
    expect(box).not.toContainElement(screen.getByRole('button', { name: 'Show 50 more' }));
    a.unmount();
    render(EventList, { ...base, clips: [] });
    expect(screen.getByRole('listbox', { name: 'Recordings' })).not.toContainElement(screen.getByText('No recordings on this day.'));
  });

  it('Show 50 more adds 50', async () => {
    render(EventList, { ...base, clips: many(120) });
    await fireEvent.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(screen.getAllByRole('option')).toHaveLength(100);
    expect(screen.getByText('Showing 100 of 120')).toBeInTheDocument();
  });

  describe('with IntersectionObserver', () => {
    class MockIO {
      static all: MockIO[] = [];
      disconnected = false;
      constructor(
        public cb: (e: { isIntersecting: boolean }[]) => void,
        public opts: IntersectionObserverInit,
      ) {
        MockIO.all.push(this);
      }
      observe = vi.fn();
      disconnect = () => {
        this.disconnected = true;
      };
    }
    beforeEach(() => {
      MockIO.all = [];
      vi.stubGlobal('IntersectionObserver', MockIO);
    });
    afterEach(() => vi.unstubAllGlobals());
    const last = () => MockIO.all.filter((o) => !o.disconnected).at(-1)!;

    it('loads 50 more when the sentinel intersects, with no button', async () => {
      render(EventList, { ...base, clips: many(120) });
      expect(screen.queryByRole('button', { name: /show .* more/i })).toBeNull();
      expect(last().opts.rootMargin).toBe('200px');
      last().cb([{ isIntersecting: true }]);
      await tick();
      expect(screen.getAllByRole('option')).toHaveLength(100);
      expect(screen.getByText('Showing 100 of 120')).toBeInTheDocument();
    });

    it('ignores a callback that is not intersecting', async () => {
      render(EventList, { ...base, clips: many(120) });
      last().cb([{ isIntersecting: false }]);
      await tick();
      expect(screen.getAllByRole('option')).toHaveLength(50);
    });

    it('drops the sentinel and disconnects once everything is shown', async () => {
      render(EventList, { ...base, clips: many(60) });
      expect(screen.getByTestId('sentinel')).toBeInTheDocument();
      last().cb([{ isIntersecting: true }]);
      await tick();
      expect(screen.getAllByRole('option')).toHaveLength(60);
      expect(screen.queryByTestId('sentinel')).toBeNull();
      expect(MockIO.all.every((o) => o.disconnected)).toBe(true);
    });

    it('disconnects on destroy', () => {
      const a = render(EventList, { ...base, clips: many(120) });
      a.unmount();
      expect(MockIO.all.every((o) => o.disconnected)).toBe(true);
    });
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

  it('only the selected row carries the playing mark', () => {
    render(EventList, { ...base, clips: [row(1), row(0)], selectedId: 'id0' });
    const [a, b] = screen.getAllByRole('option');
    expect(within(b!).getByText('playing')).toHaveClass('text-foil');
    expect(within(a!).queryByText('playing')).toBeNull();
  });

  it('rows are 64 px on phones and 56 px from md', () => {
    render(EventList, { ...base, clips: many(2) });
    for (const r of screen.getAllByRole('option')) expect(r).toHaveClass('h-16', 'md:h-14');
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
