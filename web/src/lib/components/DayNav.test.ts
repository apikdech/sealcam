// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import DayNav from './DayNav.svelte';

afterEach(cleanup);

// The menu body is the caller's; a close() it is handed shuts the popover.
const menu = createRawSnippet((close: () => () => void) => ({
  render: () => '<div data-testid="menu-body"><button type="button">Done</button></div>',
  setup: (el: Element) => {
    el.querySelector('button')!.addEventListener('click', () => close()());
  },
}));

const props = { day: '2026-11-20', todayDay: '2026-11-20', zone: 'Asia/Jakarta' };

describe('DayNav', () => {
  it('shows the title and subtitle', () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    expect(screen.getByText('Friday 20 November')).toBeTruthy();
    expect(screen.getByText('Jakarta time · today')).toBeTruthy();
  });

  it('next is disabled on today', () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    expect((screen.getByRole('button', { name: 'Next day' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('previous calls onDay with the previous day', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, onDay, menu });
    await fireEvent.click(screen.getByRole('button', { name: 'Previous day' }));
    expect(onDay).toHaveBeenCalledWith('2026-11-19');
  });

  it('next steps forward from an earlier day', async () => {
    const onDay = vi.fn();
    render(DayNav, { ...props, day: '2026-11-19', onDay, menu });
    await fireEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(onDay).toHaveBeenCalledWith('2026-11-20');
  });

  it('the title opens the day menu and toggles it shut', async () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    const title = screen.getByRole('button', { name: /Friday 20 November/ });
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('menu-body')).toBeNull();
    await fireEvent.click(title);
    expect(title).toHaveAttribute('aria-expanded', 'true');
    const pop = screen.getByRole('dialog', { name: 'Day and time zone' });
    expect(pop).toHaveAttribute('id', title.getAttribute('aria-controls'));
    expect(pop).toContainElement(screen.getByTestId('menu-body'));
    await fireEvent.click(title);
    expect(screen.queryByTestId('menu-body')).toBeNull();
  });

  it('Escape closes the menu and gives focus back to the title', async () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    const title = screen.getByRole('button', { name: /Friday 20 November/ });
    await fireEvent.click(title);
    await fireEvent.keyDown(screen.getByTestId('menu-body'), { key: 'Escape' });
    expect(screen.queryByTestId('menu-body')).toBeNull();
    expect(document.activeElement).toBe(title);
  });

  it('a press outside closes the menu', async () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    await fireEvent.click(screen.getByRole('button', { name: /Friday 20 November/ }));
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('menu-body')).toBeNull();
  });

  it('the menu can close itself', async () => {
    render(DayNav, { ...props, onDay: () => {}, menu });
    await fireEvent.click(screen.getByRole('button', { name: /Friday 20 November/ }));
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByTestId('menu-body')).toBeNull();
  });
});
