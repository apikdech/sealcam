// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DayMenu from './DayMenu.svelte';

afterEach(cleanup);

const props = (over: Record<string, unknown> = {}) => ({
  day: '2026-11-20',
  todayDay: '2026-11-20',
  forcedZone: null as string | null,
  browserZone: 'Europe/Berlin',
  cameras: [
    { id: 'front-door', name: 'Front Door' },
    { id: 'yard', name: 'Yard' },
  ],
  camera: '',
  showCamera: false,
  onDay: vi.fn(),
  onZone: vi.fn(),
  onCamera: vi.fn(),
  ...over,
});

describe('DayMenu', () => {
  it('has a date input up to today and the time zone select', () => {
    render(DayMenu, props());
    const date = screen.getByLabelText('Choose a date');
    expect(date).toHaveValue('2026-11-20');
    expect(date).toHaveAttribute('max', '2026-11-20');
    expect(screen.getByRole('combobox', { name: 'Time zone' })).toBeInTheDocument();
  });

  it('picking a date calls onDay', async () => {
    const p = props();
    render(DayMenu, p);
    await fireEvent.change(screen.getByLabelText('Choose a date'), { target: { value: '2026-11-03' } });
    expect(p.onDay).toHaveBeenCalledWith('2026-11-03');
  });

  it('an empty date value is ignored', async () => {
    const p = props();
    render(DayMenu, p);
    await fireEvent.change(screen.getByLabelText('Choose a date'), { target: { value: '' } });
    expect(p.onDay).not.toHaveBeenCalled();
  });

  it('zone select shows city names and carries the IANA id', () => {
    render(DayMenu, props());
    const jakarta = screen.getByRole('option', { name: 'Jakarta' }) as HTMLOptionElement;
    expect(jakarta.value).toBe('Asia/Jakarta');
    expect(screen.getByRole('option', { name: 'My time (Berlin)' })).toHaveValue('');
  });

  it('shows the forced zone as chosen', () => {
    render(DayMenu, props({ forcedZone: 'Asia/Jakarta' }));
    expect(screen.getByLabelText('Time zone')).toHaveValue('Asia/Jakarta');
  });

  it('reports a zone, and null for my time', async () => {
    const p = props();
    render(DayMenu, p);
    await fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Jakarta' } });
    await fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: '' } });
    expect(p.onZone.mock.calls).toEqual([['Asia/Jakarta'], [null]]);
  });

  it('the camera select shows only with showCamera, and reports a choice', async () => {
    const a = render(DayMenu, props());
    expect(screen.queryByRole('combobox', { name: 'Camera' })).toBeNull();
    a.unmount();
    const p = props({ showCamera: true });
    render(DayMenu, p);
    const select = screen.getByRole('combobox', { name: 'Camera' });
    expect(screen.getByRole('option', { name: 'All cameras' })).toHaveValue('');
    await fireEvent.change(select, { target: { value: 'yard' } });
    expect(p.onCamera).toHaveBeenCalledWith('yard');
  });

  it('selects may shrink and draw their own chevron in the palette', () => {
    render(DayMenu, props({ showCamera: true }));
    for (const name of ['Camera', 'Time zone']) {
      const select = screen.getByRole('combobox', { name });
      expect(select).toHaveClass('min-w-0', 'w-full', 'appearance-none');
      expect(select.parentElement!.querySelector('.text-muted svg')).not.toBeNull();
    }
  });
});
