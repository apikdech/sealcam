// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DayNav from './DayNav.svelte';

afterEach(cleanup);

const props = { day: '2026-11-20', todayDay: '2026-11-20', zone: 'Asia/Jakarta' };

describe('DayNav', () => {
  it('shows the title and subtitle', () => {
    render(DayNav, { ...props, onDay: () => {} });
    expect(screen.getByText('Friday 20 November')).toBeTruthy();
    expect(screen.getByText('Jakarta time · today')).toBeTruthy();
  });

  it('next is disabled on today', () => {
    render(DayNav, { ...props, onDay: () => {} });
    expect((screen.getByRole('button', { name: 'Next day' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('previous calls onDay with the previous day', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, onDay });
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onDay).toHaveBeenCalledWith('2026-11-19');
  });

  it('next steps forward from an earlier day', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, day: '2026-11-19', onDay });
    await fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onDay).toHaveBeenCalledWith('2026-11-20');
  });

  it('picking a date calls onDay', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, onDay });
    await fireEvent.change(screen.getByLabelText('Choose a date'), { target: { value: '2026-11-03' } });
    expect(onDay).toHaveBeenCalledWith('2026-11-03');
  });

  it('an empty picker value is ignored', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, onDay });
    await fireEvent.change(screen.getByLabelText('Choose a date'), { target: { value: '' } });
    expect(onDay).not.toHaveBeenCalled();
  });
});
