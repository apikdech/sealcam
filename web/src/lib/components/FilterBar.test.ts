// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FilterBar from './FilterBar.svelte';

afterEach(cleanup);

const props = () => ({
  cameras: [
    { id: 'front-door', name: 'Front Door' },
    { id: 'yard', name: 'Yard' },
  ],
  camera: '',
  trigger: '',
  forcedZone: null as string | null,
  browserZone: 'Europe/Berlin',
  onCamera: vi.fn(),
  onTrigger: vi.fn(),
  onZone: vi.fn(),
});

describe('FilterBar', () => {
  it('filters are visible without a menu', () => {
    render(FilterBar, props());
    for (const name of ['Camera', 'Trigger', 'Time zone']) expect(screen.getByRole('combobox', { name })).toBeVisible();
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull();
  });

  it('zone select shows city names and carries the IANA id', () => {
    render(FilterBar, props());
    const jakarta = screen.getByRole('option', { name: 'Jakarta' }) as HTMLOptionElement;
    expect(jakarta.value).toBe('Asia/Jakarta');
    expect(screen.getByRole('option', { name: 'My time (Berlin)' })).toHaveValue('');
  });

  it('reports each choice', async () => {
    const p = props();
    render(FilterBar, p);
    await fireEvent.change(screen.getByLabelText('Camera'), { target: { value: 'yard' } });
    await fireEvent.change(screen.getByLabelText('Trigger'), { target: { value: 'person' } });
    await fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Jakarta' } });
    await fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: '' } });
    expect(p.onCamera).toHaveBeenCalledWith('yard');
    expect(p.onTrigger).toHaveBeenCalledWith('person');
    expect(p.onZone.mock.calls).toEqual([['Asia/Jakarta'], [null]]);
  });

  it('scrolls sideways in one row', () => {
    const { container } = render(FilterBar, props());
    expect(container.firstElementChild).toHaveClass('overflow-x-auto');
  });
});
