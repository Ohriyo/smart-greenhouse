import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * EAS project id, printed by `eas init` (docs/setup-push.md step 2). Needed for
 * the Expo push token. Paste it here once; it is not a secret.
 */
const EAS_PROJECT_ID: string | undefined = undefined;

/**
 * Firebase config for FCM (docs/setup-push.md step 3). Only read when a native
 * build is made (EAS Build / prebuild); Expo Go and `expo start` ignore it, so
 * the app still starts before the file exists.
 */
const GOOGLE_SERVICES_FILE = './google-services.json';

// Android-only app. No iOS-specific settings on purpose.
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // Display name on the phone (launcher, notifications). The package id stays the same.
  name: 'ETanim',
  slug: 'smart-greenhouse',
  version: '0.1.0',
  scheme: 'smartgreenhouse',
  platforms: ['android'],
  orientation: 'portrait',
  icon: './assets/icon.png',
  // Follow the system light/dark setting (needs expo-system-ui on Android).
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.riopana.greenhouse',
    // Shown in Settings → About as "Build N". Raise it with every release build.
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: GOOGLE_SERVICES_FILE,
  },
  extra: {
    ...config.extra,
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-system-ui',
    'expo-font',
    'expo-dev-client',
    [
      'expo-notifications',
      {
        // Status-bar icon: white on transparent (Android tints it).
        icon: './assets/notification-icon.png',
        color: '#2B7650', // theme accent (light)
        // Pushes without a channelId use our alerts channel (created by the app).
        defaultChannel: 'greenhouse-alerts',
      },
    ],
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
