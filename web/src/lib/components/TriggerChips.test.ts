// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TriggerChips from './TriggerChips.svelte';

afterEach(cleanup);

const props = (over: Record<string, unknown> = {}) => ({
  selected: [] as string[],
  available: ['person', 'vehicle', 'pet', 'motion'],
  onChange: vi.fn(),
  ...over,
});

describe('TriggerChips', () => {
  it('is a labelled group with All pressed when nothing is selected', () => {
    render(TriggerChips, props());
    expect(screen.getByRole('group', { name: 'Filter by trigger' })).toBeVisible();
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Person/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lists All then person, vehicle, pet, motion', () => {
    render(TriggerChips, props());
    expect(screen.getAllByRole('button').map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      'All',
      'P Person',
      'V Vehicle',
      'A Pet',
      'M Motion',
    ]);
  });

  it('adds a trigger when clicked', async () => {
    const p = props();
    render(TriggerChips, p);
    await fireEvent.click(screen.getByRole('button', { name: /Person/ }));
    expect(p.onChange).toHaveBeenCalledWith(['person']);
  });

  it('adds to an existing selection and removes a pressed chip', async () => {
    const p = props({ selected: ['person'] });
    render(TriggerChips, p);
    expect(screen.getByRole('button', { name: /Person/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'false');
    await fireEvent.click(screen.getByRole('button', { name: /Pet/ }));
    expect(p.onChange).toHaveBeenLastCalledWith(['person', 'pet']);
    await fireEvent.click(screen.getByRole('button', { name: /Person/ }));
    expect(p.onChange).toHaveBeenLastCalledWith([]);
  });

  it('All clears the selection', async () => {
    const p = props({ selected: ['person', 'pet'] });
    render(TriggerChips, p);
    await fireEvent.click(screen.getByRole('button', { name: /All/ }));
    expect(p.onChange).toHaveBeenCalledWith([]);
  });

  it('shows Other only when it is available', () => {
    const { unmount } = render(TriggerChips, props());
    expect(screen.queryByRole('button', { name: /Other/ })).toBeNull();
    unmount();
    render(TriggerChips, props({ available: ['person', 'other'] }));
    expect(screen.getByRole('button', { name: /Other/ })).toBeVisible();
  });
});
