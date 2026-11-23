import { useEffect, useState } from 'react';
import { ApiClient } from '../utils/apiClient';

/** One household vocabulary, independent of the current transaction page/date. */
export function useLabelVocabulary(householdId: string | null) {
  const [vocabulary, setVocabulary] = useState<{ householdId: string; labels: string[] } | null>(
    null
  );

  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;
    let requestVersion = 0;
    let refreshQueued = false;

    const load = async () => {
      const version = ++requestVersion;
      try {
        const labels = await ApiClient.loadLabels();
        if (!cancelled && version === requestVersion) {
          setVocabulary({ householdId, labels });
        }
      } catch (error) {
        // Keep the last vocabulary on transient failure. A different household
        // never sees it because the returned value is scoped below.
        console.error('Error refreshing labels:', error);
      }
    };

    const unsubscribe = ApiClient.onLabelsChanged(() => {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(() => {
        refreshQueued = false;
        if (!cancelled) void load();
      });
    });
    void load();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [householdId]);

  return vocabulary?.householdId === householdId ? vocabulary.labels : [];
}
