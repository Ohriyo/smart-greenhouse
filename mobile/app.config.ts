import type { ConfigContext, ExpoConfig } from 'expo/config';

// Android-only app (see CLAUDE.md). No iOS-specific settings on purpose.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Smart Greenhouse',
  slug: 'smart-greenhouse',
  version: '0.1.0',
  scheme: 'smartgreenhouse',
  platforms: ['android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.riopana.greenhouse',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    [
      'expo-build-properties',
      {
        android: {
          // The backend runs on the laptop over plain HTTP (http://<LAN-IP>:4000).
          // Android 9+ blocks cleartext HTTP in built apps unless this is set.
          // Expo Go already allows it; this matters for the development/release
          // builds used from the push-notification phase onward.
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
