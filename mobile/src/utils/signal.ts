/** Wi-Fi signal strength from RSSI (dBm): 0–4 bars and a spoken word. */
export interface Signal {
  /** Number of filled bars, 0–4. */
  bars: 0 | 1 | 2 | 3 | 4;
  label: 'Excellent' | 'Good' | 'Fair' | 'Weak' | 'Very weak';
}

export function signalOf(rssi: number): Signal {
  if (rssi >= -55) return { bars: 4, label: 'Excellent' };
  if (rssi >= -65) return { bars: 3, label: 'Good' };
  if (rssi >= -75) return { bars: 2, label: 'Fair' };
  if (rssi >= -85) return { bars: 1, label: 'Weak' };
  return { bars: 0, label: 'Very weak' };
}

/** "−58 dBm" with a real minus sign, as in the prototype. */
export function formatRssi(rssi: number): string {
  return `${String(rssi).replace('-', '−')} dBm`;
}
