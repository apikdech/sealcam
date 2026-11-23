// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeButton from './ThemeButton.svelte';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ThemeButton', () => {
  it('starts on System when nothing is stored', () => {
    render(ThemeButton);
    const b = screen.getByRole('button');
    expect(b.getAttribute('aria-label')).toBe('Theme: System');
    expect(b.getAttribute('title')).toBe('Theme: System');
  });

  it('cycles Light, Dark, System and keeps the choice per browser', async () => {
    render(ThemeButton);
    const b = screen.getByRole('button');
    await fireEvent.click(b);
    expect(b.getAttribute('aria-label')).toBe('Theme: Light');
    expect(localStorage.getItem('zview.theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    await fireEvent.click(b);
    expect(b.getAttribute('aria-label')).toBe('Theme: Dark');
    await fireEvent.click(b);
    expect(b.getAttribute('aria-label')).toBe('Theme: System');
    expect(localStorage.getItem('zview.theme')).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('starts on the applied theme when the store is blocked', async () => {
    const first = render(ThemeButton);
    await fireEvent.click(screen.getByRole('button'));
    await fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Theme: Dark');
    first.unmount();
    // Storage blocked: the choice lives on the page only.
    localStorage.clear();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(ThemeButton);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Theme: Dark');
  });

  it('starts on the stored choice', () => {
    localStorage.setItem('zview.theme', 'dark');
    render(ThemeButton);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Theme: Dark');
  });
});
