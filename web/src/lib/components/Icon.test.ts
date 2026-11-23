// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import Icon, { ICON_NAMES } from './Icon.svelte';

describe('Icon', () => {
  it('renders every IconName as an svg with at least one path', () => {
    expect(ICON_NAMES.length).toBe(26);
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(Icon, { name });
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg!.querySelectorAll('path').length, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it('is aria-hidden without a label', () => {
    const { container } = render(Icon, { name: 'play' });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('has role img and the label when labelled', () => {
    const { getByRole } = render(Icon, { name: 'key', label: 'Encrypted' });
    const svg = getByRole('img', { name: 'Encrypted' });
    expect(svg.getAttribute('aria-hidden')).toBeNull();
  });

  it('uses currentColor and stroke-width 1.75', () => {
    const { container } = render(Icon, { name: 'check', size: 20 });
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
    expect(svg.getAttribute('fill')).toBe('none');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('20');
  });
});
