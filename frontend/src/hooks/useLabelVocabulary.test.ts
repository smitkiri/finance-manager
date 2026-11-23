import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiClient } from '../utils/apiClient';
import { useLabelVocabulary } from './useLabelVocabulary';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('household label vocabulary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads unused/cross-page names and refreshes after a successful mutation', async () => {
    const load = vi
      .spyOn(ApiClient, 'loadLabels')
      .mockResolvedValueOnce(['OtherPage', 'Unused'])
      .mockResolvedValueOnce(['New', 'OtherPage', 'Unused']);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    const { result } = renderHook(() => useLabelVocabulary('house-a'));
    await waitFor(() => expect(result.current).toEqual(['OtherPage', 'Unused']));
    await act(async () => {
      await ApiClient.apiFetch('/api/expenses/one', { method: 'PATCH' });
    });
    await waitFor(() => expect(result.current).toEqual(['New', 'OtherPage', 'Unused']));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces notifications from one batch and ignores failed writes and reads', async () => {
    const load = vi.spyOn(ApiClient, 'loadLabels').mockResolvedValue(['Flight']);
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    renderHook(() => useLabelVocabulary('house-a'));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.all([
        ApiClient.apiFetch('/api/expenses/one', { method: 'PATCH' }),
        ApiClient.apiFetch('/api/expenses/two', { method: 'PATCH' }),
      ]);
    });
    expect(load).toHaveBeenCalledTimes(2);
    fetch.mockResolvedValue(new Response('{}', { status: 422 }));
    await act(async () => {
      await ApiClient.apiFetch('/api/restore', { method: 'POST' });
    });
    fetch.mockResolvedValue(new Response('{}'));
    await act(async () => {
      await ApiClient.apiFetch('/api/expenses');
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('hides old vocabulary immediately and rejects late results after household switch', async () => {
    const old = deferred<string[]>();
    vi.spyOn(ApiClient, 'loadLabels')
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(['HouseB']);
    const { result, rerender } = renderHook(({ id }) => useLabelVocabulary(id), {
      initialProps: { id: 'house-a' },
    });
    rerender({ id: 'house-b' });
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual(['HouseB']));
    await act(async () => old.resolve(['HouseA']));
    expect(result.current).toEqual(['HouseB']);
  });

  it('does not notify a new household for a previous household mutation', async () => {
    const pending = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending.promise));
    const load = vi
      .spyOn(ApiClient, 'loadLabels')
      .mockResolvedValueOnce(['HouseA'])
      .mockResolvedValueOnce(['HouseB']);
    const { rerender } = renderHook(({ id }) => useLabelVocabulary(id), {
      initialProps: { id: 'house-a' },
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const mutation = ApiClient.apiFetch('/api/restore', { method: 'POST' });
    rerender({ id: 'house-b' });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => {
      pending.resolve(new Response('{}'));
      await mutation;
    });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('keeps vocabulary on refresh error and ignores completion after unmount', async () => {
    const pending = deferred<string[]>();
    const load = vi
      .spyOn(ApiClient, 'loadLabels')
      .mockResolvedValueOnce(['Flight'])
      .mockRejectedValueOnce(new Error('offline'))
      .mockReturnValueOnce(pending.promise);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    const { result, unmount } = renderHook(() => useLabelVocabulary('house-a'));
    await waitFor(() => expect(result.current).toEqual(['Flight']));
    await act(async () => {
      await ApiClient.apiFetch('/api/expenses', { method: 'POST' });
    });
    expect(result.current).toEqual(['Flight']);
    await act(async () => {
      await ApiClient.apiFetch('/api/restore', { method: 'POST' });
    });
    expect(load).toHaveBeenCalledTimes(3);
    unmount();
    await act(async () => pending.resolve(['Late']));
    expect(result.current).toEqual(['Flight']);
  });
});
