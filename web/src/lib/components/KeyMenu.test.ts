// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KeyMenu from './KeyMenu.svelte';

afterEach(cleanup);

const button = () => screen.getByRole('button', { name: 'Key and lock' });

describe('KeyMenu', () => {
  it('is a closed menu button', () => {
    render(KeyMenu, { canLock: true, onLock: () => {} });
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens with Lock now and Manage keys', async () => {
    render(KeyMenu, { canLock: true, onLock: () => {} });
    await fireEvent.click(button());
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Lock now' })).toBeTruthy();
    const manage = screen.getByRole('menuitem', { name: 'Manage keys' });
    expect(manage.tagName).toBe('A');
    expect(manage.getAttribute('href')).toBe('#/key');
  });

  it('Lock now calls onLock and closes', async () => {
    const onLock = vi.fn();
    render(KeyMenu, { canLock: true, onLock });
    await fireEvent.click(button());
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Lock now' }));
    expect(onLock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables Lock now when it cannot lock', async () => {
    const onLock = vi.fn();
    render(KeyMenu, { canLock: false, onLock });
    await fireEvent.click(button());
    const item = screen.getByRole('menuitem', { name: 'Lock now' }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    await fireEvent.click(item);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('Escape closes and focus returns to the button', async () => {
    render(KeyMenu, { canLock: true, onLock: () => {} });
    await fireEvent.click(button());
    await fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button());
  });

  it('an outside click closes', async () => {
    render(KeyMenu, { canLock: true, onLock: () => {} });
    await fireEvent.click(button());
    await fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });
});
