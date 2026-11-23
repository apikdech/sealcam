export type ThemeChoice = 'system' | 'light' | 'dark';

export const THEME_KEY = 'zview.theme';
export const THEME_EVENT = 'zview:theme';

const GROUND = { dark: '#0E1A1F', light: '#EDE9DF' } as const;
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

/** The stored choice; anything unknown, missing or unreadable is `system`. */
export function loadTheme(storage?: Pick<Storage, 'getItem'>): ThemeChoice {
  try {
    const v = (storage ?? localStorage).getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Stores the choice; `system` is the absence of a key. A blocked store is ignored. */
export function saveTheme(c: ThemeChoice, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    const s = storage ?? localStorage;
    if (c === 'system') s.removeItem(THEME_KEY);
    else s.setItem(THEME_KEY, c);
  } catch {
    // The choice then lasts for this page only.
  }
}

/** The theme on the page now (set at start-up), else the stored choice. A blocked store then keeps the page's choice. */
export function currentTheme(doc: Document = document): ThemeChoice {
  const t = doc.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : loadTheme();
}

export function nextTheme(c: ThemeChoice): ThemeChoice {
  return ORDER[(ORDER.indexOf(c) + 1) % ORDER.length]!;
}

/** Puts the choice on the page: data-theme, the browser chrome colour, and an event for canvases to repaint. */
export function applyTheme(c: ThemeChoice, doc: Document = document): void {
  const root = doc.documentElement;
  if (c === 'system') delete root.dataset.theme;
  else root.dataset.theme = c;
  const light = c === 'system' ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ?? false) : c === 'light';
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? GROUND.light : GROUND.dark);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** In System mode, re-applies the theme when the OS switches between light and dark (the browser chrome colour). */
export function followSystemTheme(doc: Document = document): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: light)');
  const sync = () => {
    if (!doc.documentElement.dataset.theme) applyTheme('system', doc);
  };
  mq?.addEventListener?.('change', sync);
  return () => mq?.removeEventListener?.('change', sync);
}
