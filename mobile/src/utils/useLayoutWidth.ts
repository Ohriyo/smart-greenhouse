import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/** Width of a view from onLayout (charts, sliders and tracks size themselves to it). */
export function useLayoutWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);
  return [width, onLayout];
}
