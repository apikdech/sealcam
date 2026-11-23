import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../app.css', import.meta.url), 'utf8');
const lightBlock = /:root\[data-theme='light'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
const rootBlock = /^:root\s*\{([^}]*)\}/m.exec(css)?.[1] ?? '';

const hex = (block: string, name: string): string => {
  const m = new RegExp(`--z-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  if (!m) throw new Error(`--z-${name} not found`);
  return m[1]!;
};
const light = (name: string) => hex(lightBlock, name);
const trigger = (name: string) => hex(rootBlock, `${name}`);

function luminance(h: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('light theme contrast (WCAG)', () => {
  it.each(['ground', 'plate'])('ink and muted hold 4.5:1 on %s', (bg) => {
    expect(contrast(light('ink'), light(bg))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light('muted'), light(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['line', 'foil', 'amber', 'void'])('%s holds 3:1 on ground and plate', (fg) => {
    expect(contrast(light(fg), light('ground'))).toBeGreaterThanOrEqual(3);
    expect(contrast(light(fg), light('plate'))).toBeGreaterThanOrEqual(3);
  });

  // KNOWN FAILURE: the Spec Colours Rule fixes the trigger colours (ui-spec §4.6), so they are not retinted.
  // On the light plate they give about 1.7 to 2.9:1, under the 3:1 non-text minimum. `it.fails` records this
  // and turns red when the colours are fixed, as a prompt to make it a normal test.
  it.fails.each(['person', 'vehicle', 'pet', 'motion', 'other'])('trigger %s holds 3:1 on the light plate (known failure)', (t) => {
    expect(contrast(trigger(t), light('plate'))).toBeGreaterThanOrEqual(3);
  });
});
