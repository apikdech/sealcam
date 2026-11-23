// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThemeButton from './ThemeButton.svelte';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

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

  it('starts on the stored choice', () => {
    localStorage.setItem('zview.theme', 'dark');
    render(ThemeButton);
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Theme: Dark');
  });
});
