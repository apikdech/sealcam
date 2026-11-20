// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Seal from './Seal.svelte';
import { sealLabel, type SealState } from './rosette';

const STATES: SealState[] = ['unchecked', 'verifying', 'verified', 'incomplete', 'mismatch', 'tampered', 'unknown-key'];

describe('Seal', () => {
  it('has data-seal-state and an accessible name per state', () => {
    for (const state of STATES) {
      const { container, getByRole, unmount } = render(Seal, { seed: 'c1', state });
      expect(container.querySelector(`[data-seal-state="${state}"]`)).not.toBeNull();
      expect(getByRole('img', { name: sealLabel(state) })).toBeTruthy();
      unmount();
    }
  });

  it('shows the label text only with showLabel', () => {
    const a = render(Seal, { seed: 'c1', state: 'verified' });
    expect(a.container.textContent).not.toContain('Encrypted recording verified');
    a.unmount();
    const b = render(Seal, { seed: 'c1', state: 'verified', showLabel: true });
    expect(b.container.textContent).toContain('Encrypted recording verified');
  });

  it('tampered renders the VOID pattern and no rosette path', () => {
    const { container } = render(Seal, { seed: 'c1', state: 'tampered' });
    expect(container.querySelector('[data-rosette]')).toBeNull();
    expect(container.querySelector('clipPath')).not.toBeNull();
    expect(container.textContent).toContain('VOID');
  });

  it('unchecked renders no rosette path', () => {
    const { container } = render(Seal, { seed: 'c1', state: 'unchecked' });
    expect(container.querySelector('[data-rosette]')).toBeNull();
  });

  it('decorative hides the svg from assistive tech and ignores showLabel', () => {
    const { container, queryByRole } = render(Seal, { seed: 'c1', state: 'verified', decorative: true, showLabel: true });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('role')).toBe(false);
    expect(svg.hasAttribute('aria-label')).toBe(false);
    expect(queryByRole('img')).toBeNull();
    expect(container.textContent).not.toContain('Encrypted recording verified');
  });

  it('rosette states render one', () => {
    const { container } = render(Seal, { seed: 'c1', state: 'verified' });
    expect(container.querySelector('[data-rosette]')).not.toBeNull();
  });
});
