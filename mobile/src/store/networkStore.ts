import { create } from 'zustand';

export type NetworkType = 'wifi' | 'cellular' | 'none' | 'other' | 'unknown';

interface NetworkState {
  /** false = no internet at all (no Wi-Fi, no mobile data); null = not known yet. */
  connected: boolean | null;
  type: NetworkType;
  /** The phone's IPv4 address on Wi-Fi (null on mobile data / unknown): a change means a new network. */
  ipAddress: string | null;
  set: (s: Pick<NetworkState, 'connected' | 'type' | 'ipAddress'>) => void;
}

/** Phone connectivity from NetInfo (src/services/network.ts keeps it updated). */
export const useNetworkStore = create<NetworkState>((set) => ({
  connected: null,
  type: 'unknown',
  ipAddress: null,
  set: (s) => set(s),
}));
