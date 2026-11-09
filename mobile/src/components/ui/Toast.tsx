import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardShadow, useTheme, type StatusTone } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

import type { IconName } from './Icon';
import { IconTile } from './IconTile';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface ToastOptions {
  /** Bold first line; the message becomes the detail line. */
  title?: string;
  /** Tap action (e.g. open the Alerts tab). Tapping always dismisses. */
  onPress?: () => void;
}

interface ToastMessage extends ToastOptions {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 3500;
const VISUAL: Record<ToastTone, { icon: IconName; tone: StatusTone }> = {
  success: { icon: 'checkmark', tone: 'ok' },
  error: { icon: 'alert-circle-outline', tone: 'danger' },
  info: { icon: 'information-circle-outline', tone: 'info' },
  warning: { icon: 'warning-outline', tone: 'warning' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = 'info', options?: ToastOptions) => {
    setToast({ id: nextId.current++, message, tone, ...options });
    AccessibilityInfo.announceForAccessibility(
      options?.title ? `${options.title}. ${message}` : message,
    );
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  const hide = useCallback(() => setToast(null), []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onHide={hide} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Slides in from the top as a light card; tap or wait to dismiss. */
function ToastView({ toast, onHide }: { toast: ToastMessage; onHide: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    const duration = reducedMotion ? 0 : 260;
    progress.set(withTiming(1, { duration, easing: Easing.out(Easing.cubic) }));
    const timer = setTimeout(onHide, DURATION_MS);
    return () => clearTimeout(timer);
  }, [progress, onHide, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }],
  }));

  const v = VISUAL[toast.tone];
  const press = () => {
    toast.onPress?.();
    onHide();
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <Animated.View style={[styles.wrap, style]}>
        <Pressable
          onPress={press}
          accessibilityRole="alert"
          accessibilityLabel={toast.title ? `${toast.title}. ${toast.message}` : toast.message}
          accessibilityHint={toast.onPress ? 'Opens details' : 'Dismisses the message'}
          style={[
            styles.toast,
            {
              backgroundColor: theme.colors.overlay,
              borderColor: theme.colors.border,
              boxShadow: cardShadow(theme),
            },
          ]}
        >
          <IconTile icon={v.icon} tone={v.tone} size={36} />
          <View style={styles.text}>
            {toast.title ? (
              <Text variant="bodyStrong" numberOfLines={1}>
                {toast.title}
              </Text>
            ) : null}
            <Text
              variant={toast.title ? 'caption' : 'bodyStrong'}
              color={toast.title ? 'secondary' : 'primary'}
              numberOfLines={3}
            >
              {toast.message}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  wrap: { alignSelf: 'stretch', maxWidth: 480 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: { flex: 1, gap: 1 },
});
