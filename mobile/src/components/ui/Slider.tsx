import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';

import { useTheme } from '@/theme';
import { useLayoutWidth } from '@/utils/useLayoutWidth';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Fill + thumb color (e.g. coral for "ON at", green for "OFF at"). */
  color: string;
  /** Spoken label; the visible label is usually the row above. */
  accessibilityLabel: string;
  /** Spoken unit, e.g. "degrees Celsius". */
  spokenUnit?: string;
  disabled?: boolean;
}

const THUMB = 20;
const TRACK = 4;
const HEIGHT = 48; // full touch target

/** Track + colored fill + round thumb. Drag or tap; TalkBack swipes up/down to adjust. */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  color,
  accessibilityLabel,
  spokenUnit = '',
  disabled = false,
}: SliderProps) {
  const theme = useTheme();
  const [width, onLayout] = useLayoutWidth();
  // Last value sent, so a drag reports each step once.
  const last = useRef(value);
  useEffect(() => {
    last.current = value;
  }, [value]);

  const usable = Math.max(1, width - THUMB);
  const ratio = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
  const thumbX = ratio * usable;

  const decimals = step < 1 ? (String(step).split('.')[1]?.length ?? 1) : 0;
  const snap = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, stepped)).toFixed(decimals));
  };
  const fromX = (x: number) => {
    if (disabled || width === 0) return;
    const next = snap(min + ((x - THUMB / 2) / usable) * (max - min));
    if (next !== last.current) {
      last.current = next;
      onChange(next);
    }
  };

  // Horizontal drags only, so vertical scrolling of the screen still works.
  const pan = usePanGesture({
    runOnJS: true,
    enabled: !disabled,
    activeOffsetX: [-6, 6],
    failOffsetY: [-12, 12],
    onActivate: (e) => fromX(e.x),
    onUpdate: (e) => fromX(e.x),
  });

  const adjust = (dir: 1 | -1) => {
    const next = snap(value + dir * step);
    if (next !== value) onChange(next);
  };

  return (
    <GestureDetector gesture={pan}>
      <Pressable
        onLayout={onLayout}
        onPress={(e) => fromX(e.nativeEvent.locationX)}
        disabled={disabled}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: value, text: `${value} ${spokenUnit}`.trim() }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => adjust(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={[styles.root, disabled ? styles.disabled : null]}
      >
        <View style={[styles.track, { backgroundColor: theme.colors.text, opacity: 0.75 }]} />
        <View style={[styles.fill, { width: thumbX + THUMB / 2, backgroundColor: color }]} />
        <View
          style={[
            styles.thumb,
            {
              left: thumbX,
              backgroundColor: color,
              borderColor: theme.colors.surface,
              boxShadow: `0px 1px 3px ${theme.colors.shadow}`,
            },
          ]}
        />
      </Pressable>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { height: HEIGHT, justifyContent: 'center' },
  track: {
    position: 'absolute',
    left: THUMB / 2,
    right: THUMB / 2,
    height: TRACK,
    borderRadius: TRACK / 2,
  },
  fill: { position: 'absolute', left: THUMB / 2, height: TRACK, borderRadius: TRACK / 2 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
  disabled: { opacity: 0.5 },
});
