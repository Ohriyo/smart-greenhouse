import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, type Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import Constants from 'expo-constants';

import { ApiError } from '@/services/api';

/** Saved data older than this is dropped on start (and kept in memory as long). */
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Changing this discards every saved cache on the next start. Bump the suffix
 * whenever a response shape in src/types/api.ts changes, so old saved data
 * never reaches new code.
 */
const CACHE_BUSTER = `${Constants.expoConfig?.version ?? '0'}-api9`;

/** Saved for offline cold starts. History is left out: big, and refetched anyway. */
const PERSISTED = new Set(['devices', 'latest', 'thresholds', 'alerts', 'notificationSettings']);

function shouldPersist(query: Query): boolean {
  const root = query.queryKey[0];
  return query.state.status === 'success' && typeof root === 'string' && PERSISTED.has(root);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000, // socket events keep the live data fresh in between
        gcTime: PERSIST_MAX_AGE_MS, // must be ≥ maxAge, or restored data is dropped
        // Try even when NetInfo says offline (the LAN may still work), then pause
        // retries until the network is back (onlineManager, src/services/network.ts).
        networkMode: 'offlineFirst',
        // Retry once for network hiccups; never retry 4xx or schema mismatches.
        retry: (failureCount, error) =>
          failureCount < 1 &&
          (!(error instanceof ApiError) || error.kind === 'network' || error.kind === 'timeout'),
      },
      mutations: {
        // Never queue commands while offline: a fan command sent minutes later
        // would surprise you. Fail at once and show the error instead.
        networkMode: 'always',
      },
    },
  });
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage, key: 'query-cache' }),
  maxAge: PERSIST_MAX_AGE_MS,
  buster: CACHE_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};
