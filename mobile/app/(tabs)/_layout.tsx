import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { selectUnreadCount, useMockStore } from '@/store/mockStore';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    // The tab bar always passes plain color strings (tabBar*TintColor).
    return (
      <Ionicons
        name={focused ? active : inactive}
        size={24}
        color={typeof color === 'string' ? color : undefined}
      />
    );
  }
  return TabIcon;
}

// Created once, not per render (a new component type would remount the icon).
const DashboardIcon = tabIcon('leaf', 'leaf-outline');
const HistoryIcon = tabIcon('stats-chart', 'stats-chart-outline');
const AlertsIcon = tabIcon('notifications', 'notifications-outline');
const ControlIcon = tabIcon('options', 'options-outline');
const SettingsIcon = tabIcon('settings', 'settings-outline');

export default function TabLayout() {
  const theme = useTheme();
  const unread = useMockStore(selectUnreadCount);

  return (
    <Tabs
      // Android back button / back gesture: from any tab go to Dashboard first,
      // a second back leaves the app.
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard', tabBarIcon: DashboardIcon }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: HistoryIcon }} />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: AlertsIcon,
          tabBarBadge: unread > 0 ? unread : undefined,
          tabBarAccessibilityLabel: unread > 0 ? `Alerts, ${unread} unread` : 'Alerts',
        }}
      />
      <Tabs.Screen name="control" options={{ title: 'Control', tabBarIcon: ControlIcon }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: SettingsIcon }} />
    </Tabs>
  );
}
