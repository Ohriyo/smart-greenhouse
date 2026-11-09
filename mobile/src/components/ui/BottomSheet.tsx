import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';
import { useReducedMotion } from '@/utils/useReducedMotion';

import { IconButton } from './Button';
import { SectionHeader } from './SectionHeader';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  /** Eyebrow color (e.g. the purple of the dev demo tools). */
  eyebrowTint?: string;
  children: ReactNode;
}

const DISMISS_DRAG = 120;

/**
 * Modal sheet from the bottom: backdrop tap, the close button, a downward drag on
 * the handle, or the Android back button closes it. Rounded container (not a button).
 */
export function BottomSheet({
  visible,
  onClose,
  eyebrow,
  title,
  eyebrowTint,
  children,
}: BottomSheetProps) {
  const theme = useTheme();
  const { colors } = theme;
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  // Keep the Modal mounted during the closing animation (derived during render).
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const offset = useSharedValue(screenH);

  // Keyboard height, so a sheet with a text field rises above it (a Modal is its
  // own window: the screen's keyboard handling doesn't reach it).
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboard(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      offset.set(screenH);
      offset.set(
        withTiming(0, { duration: reducedMotion ? 0 : 260, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      offset.set(
        withTiming(screenH, { duration: reducedMotion ? 0 : 200 }, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, offset, screenH, reducedMotion]);

  const drag = usePanGesture({
    activeOffsetY: 6,
    onUpdate: (e) => {
      offset.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > 800) {
        scheduleOnRN(onClose);
      } else {
        offset.set(withTiming(0, { duration: 180 }));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, 1 - offset.value / Math.max(1, screenH * 0.6)),
  }));

  if (!mounted) return null;

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A Modal is a separate native root: gestures need their own root view. */}
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}
        >
          <Pressable
            style={styles.fill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              bottom: keyboard,
              paddingBottom: keyboard > 0 ? 16 : insets.bottom + 16,
              maxHeight: (screenH - keyboard) * 0.9,
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={drag}>
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
          </GestureDetector>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <SectionHeader eyebrow={eyebrow} title={title} eyebrowTint={eyebrowTint} />
            </View>
            <IconButton icon="close" onPress={onClose} accessibilityLabel="Close" variant="plain" />
          </View>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerText: { flex: 1 },
  body: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
});
