import { create } from 'zustand';

export type NetworkType = 'wifi' | 'cellular' | 'none' | 'other' | 'unknown';

interface NetworkState {
  /** false = no Wi-Fi and no mobile data; null = not known yet. */
  connected: boolean | null;
  type: NetworkType;
  /** The phone's IPv4 address on Wi-Fi (null on mobile data / unknown). */
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

/**
 * Is the phone on the same LAN as the server? Compares the first three octets
 * of two IPv4 addresses (home routers use /24 networks). null = can't tell
 * (server is a hostname, IPv6, or the phone's IP is unknown).
 */
export function sameLan(serverUrl: string | null, phoneIp: string | null): boolean | null {
  if (!serverUrl || !phoneIp) return null;
  let host: string;
  try {
    host = new URL(serverUrl).hostname;
  } catch {
    return null;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/;
  const a = ipv4.exec(host);
  const b = ipv4.exec(phoneIp);
  if (!a || !b) return null;
  return a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
