// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_EVENT, THEME_KEY, applyTheme, currentTheme, followSystemTheme, loadTheme, nextTheme, saveTheme } from './theme';

beforeEach(() => {
  document.head.replaceChildren();
  const m = document.createElement('meta');
  m.name = 'theme-color';
  m.content = '#0E1A1F';
  document.head.append(m);
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe('theme preference', () => {
  it('falls back to system when storage throws', () => {
    const bad = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(loadTheme(bad)).toBe('system');
  });
  it('falls back to system when nothing is stored', () => expect(loadTheme({ getItem: () => null })).toBe('system'));
  it('ignores unknown stored values', () => expect(loadTheme({ getItem: () => 'blue' })).toBe('system'));
  it('reads light and dark', () => {
    expect(loadTheme({ getItem: () => 'light' })).toBe('light');
    expect(loadTheme({ getItem: () => 'dark' })).toBe('dark');
  });
  it('cycles system, light, dark, system', () => {
    expect([nextTheme('system'), nextTheme('light'), nextTheme('dark')]).toEqual(['light', 'dark', 'system']);
  });
  it('saves light and dark under the key', () => {
    const setItem = vi.fn();
    saveTheme('dark', { setItem, removeItem: vi.fn() });
    expect(setItem).toHaveBeenCalledWith(THEME_KEY, 'dark');
  });
  it('saving system removes the key', () => {
    const removeItem = vi.fn();
    saveTheme('system', { setItem: vi.fn(), removeItem });
    expect(removeItem).toHaveBeenCalledWith(THEME_KEY);
  });
  it('a throwing storage is swallowed', () => {
    const boom = () => {
      throw new Error('denied');
    };
    expect(() => saveTheme('light', { setItem: boom, removeItem: boom })).not.toThrow();
    expect(() => saveTheme('system', { setItem: boom, removeItem: boom })).not.toThrow();
  });
});

describe('applyTheme', () => {
  const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');

  it('light sets data-theme, theme-color and fires the event once', () => {
    const seen = vi.fn();
    window.addEventListener(THEME_EVENT, seen);
    applyTheme('light');
    window.removeEventListener(THEME_EVENT, seen);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(meta()).toBe('#EDE9DF');
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it('dark sets the dark ground', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(meta()).toBe('#0E1A1F');
  });
  it('system removes data-theme and follows the system scheme', () => {
    document.documentElement.dataset.theme = 'dark';
    window.matchMedia = ((q: string) => ({ matches: q.includes('light') })) as never;
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(meta()).toBe('#EDE9DF');
    window.matchMedia = ((q: string) => ({ matches: !q.includes('light') && false })) as never;
    applyTheme('system');
    expect(meta()).toBe('#0E1A1F');
  });
});

describe('currentTheme', () => {
  it('reads the applied theme first, so a blocked store does not lose the choice', () => {
    document.documentElement.dataset.theme = 'dark';
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(currentTheme()).toBe('dark');
  });
  it('falls back to the stored choice when nothing is applied', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(currentTheme()).toBe('light');
    localStorage.removeItem(THEME_KEY);
    expect(currentTheme()).toBe('system');
  });
});

describe('followSystemTheme', () => {
  const meta = () => document.querySelector('meta[name="theme-color"]')!.getAttribute('content');
  function fakeScheme(light: boolean) {
    const listeners: (() => void)[] = [];
    const mq = {
      matches: light,
      addEventListener: (_: string, f: () => void) => listeners.push(f),
      removeEventListener: (_: string, f: () => void) => listeners.splice(listeners.indexOf(f), 1),
    };
    window.matchMedia = (() => mq) as never;
    return {
      flip(to: boolean) {
        mq.matches = to;
        for (const f of [...listeners]) f();
      },
      listeners,
    };
  }

  it('in System mode the browser chrome colour follows an OS switch', () => {
    const os = fakeScheme(false);
    applyTheme('system');
    const stop = followSystemTheme();
    expect(meta()).toBe('#0E1A1F');
    os.flip(true);
    expect(meta()).toBe('#EDE9DF');
    os.flip(false);
    expect(meta()).toBe('#0E1A1F');
    stop();
    expect(os.listeners).toHaveLength(0);
  });

  it('a Light or Dark choice ignores an OS switch', () => {
    const os = fakeScheme(false);
    applyTheme('dark');
    followSystemTheme();
    os.flip(true);
    expect(meta()).toBe('#0E1A1F');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
