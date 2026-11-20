// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoadProblem from './LoadProblem.svelte';

afterEach(cleanup);

describe('LoadProblem', () => {
  it('sends a locked key to the key page', () => {
    render(LoadProblem, { kind: 'key', text: 'Could not load recordings.', onRetry: () => {} });
    expect(screen.getByRole('alert')).toHaveTextContent('Your key is locked.');
    expect(screen.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', '#/key');
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('offers Try again for a failed load', async () => {
    const onRetry = vi.fn();
    render(LoadProblem, { kind: 'failed', text: 'Could not load recordings.', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load recordings.');
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
