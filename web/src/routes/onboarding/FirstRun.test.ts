// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import FirstRun from './FirstRun.svelte';

afterEach(cleanup);

describe('FirstRun', () => {
  it('states the privacy sentence and renders the form', () => {
    render(FirstRun, { client: { call: async () => ({}) as never }, onImported: () => {} });
    expect(screen.getByRole('heading', { name: 'Add the family key' })).toBeInTheDocument();
    expect(screen.getByText('The key stays on this device. The server never sees it or your video.')).toBeInTheDocument();
    expect(screen.getByLabelText('Family key')).toBeInTheDocument();
    // The top bar carries the wordmark.
    expect(screen.queryByText('zview')).toBeNull();
  });
});
