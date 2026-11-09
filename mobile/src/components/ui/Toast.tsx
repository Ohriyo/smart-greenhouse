import Ionicons from '@expo/vector-icons/Ionicons';
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
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

import type { IconName } from './Button';
import { Text } from './Text';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 3000;
const ICONS: Record<ToastTone, IconName> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ id: nextId.current++, message, tone });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onHide={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

function ToastView({ toast, onHide }: { toast: ToastMessage; onHide: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const duration = reducedMotion ? 0 : 180;
    Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration, useNativeDriver: true }).start(() => onHide());
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [anim, onHide, reducedMotion]);

  // Inverted surface so the toast stands out in both themes.
  const iconColor =
    toast.tone === 'error'
      ? theme.colors.danger
      : toast.tone === 'success'
        ? theme.colors.accent
        : theme.colors.textTertiary;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <Animated.View
        style={{
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
          ],
        }}
      >
        <Pressable
          onPress={onHide}
          accessibilityRole="alert"
          accessibilityLabel={toast.message}
          accessibilityHint="Dismisses the message"
          style={[
            styles.toast,
            { backgroundColor: theme.colors.overlay, borderRadius: theme.radii.md },
          ]}
        >
          <Ionicons name={ICONS[toast.tone]} size={22} color={iconColor} />
          <Text
            variant="bodyStrong"
            tint={theme.colors.background}
            style={styles.message}
            numberOfLines={3}
          >
            {toast.message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 480,
    elevation: 6,
  },
  message: { flexShrink: 1 },
});
