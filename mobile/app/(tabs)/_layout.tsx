import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui';
import { useUnreadCount } from '@/features/alerts/queries';
import { fonts, useTheme } from '@/theme';

/** Active tab: green icon inside a soft green pill; inactive: gray icon. */
function tabIcon(name: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <TabIconView name={name} focused={focused} color={typeof color === 'string' ? color : ''} />
    );
  }
  return TabIcon;
}

function TabIconView({
  name,
  focused,
  color,
}: {
  name: IconName;
  focused: boolean;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, focused ? { backgroundColor: theme.colors.accentSoft } : null]}>
      <Icon name={name} size={22} color={color || theme.colors.textSecondary} />
    </View>
  );
}

// Created once, not per render (a new component type would remount the icon).
const HomeIcon = tabIcon('grid-outline');
const HistoryIcon = tabIcon('mci-history');
const AlertsIcon = tabIcon('notifications-outline');
const ControlIcon = tabIcon('mci-fan');
const SettingsIcon = tabIcon('settings-outline');

export default function TabLayout() {
  const theme = useTheme();
  const { colors } = theme;
  const unread = useUnreadCount().data ?? 0;
  // Edge-to-edge: a custom height disables the automatic bottom inset, so add it here.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      // Android back button / back gesture: from any tab go to Home first,
      // a second back leaves the app.
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 66 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 6,
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginTop: 2 },
        tabBarBadgeStyle: {
          backgroundColor: colors.danger,
          color: colors.onAccent,
          fontFamily: fonts.semibold,
          fontSize: 10,
          minWidth: 18,
          height: 18,
          lineHeight: 16,
          borderWidth: 1.5,
          borderColor: colors.surface,
          top: 0,
        },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: HomeIcon }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: HistoryIcon }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: AlertsIcon,
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarAccessibilityLabel: unread > 0 ? `Alerts, ${unread} unread` : 'Alerts',
        }}
      />
      <Tabs.Screen name="control" options={{ title: 'Control', tabBarIcon: ControlIcon }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
