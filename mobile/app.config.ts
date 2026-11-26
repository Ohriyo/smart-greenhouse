import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * EAS project id, printed by `eas init` (docs/setup-push.md step 2). Needed for
 * the Expo push token. Paste it here once; it is not a secret.
 */
const EAS_PROJECT_ID: string | undefined = undefined;

/**
 * Firebase config for FCM push (docs/setup-push.md step 3). Used only when the
 * file exists: without it a native build (EAS Build) still works, just without
 * closed-app push notifications.
 */
const GOOGLE_SERVICES_FILE = './google-services.json';

/**
 * Plain-HTTP backend (local development, e.g. http://192.168.x.x:4000)? Android 9+
 * blocks cleartext HTTP in built apps unless it is allowed. A build pointed at
 * the deployed HTTPS backend doesn't allow it.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const allowCleartext = API_URL.startsWith('http://');

// On EAS Build (the APK), stop early instead of shipping an app that can't reach
// its server: the URL comes from eas.json ("env" of the build profile).
if (process.env.EAS_BUILD === 'true' && !/^https:\/\/[^/]+$/.test(API_URL.replace(/\/+$/, ''))) {
  throw new Error(
    'EXPO_PUBLIC_API_URL must be the deployed backend, e.g. https://your-service.onrender.com ' +
      '(set it in mobile/eas.json → build → preview → env).',
  );
}
if (process.env.EAS_BUILD === 'true' && API_URL.includes('REPLACE-WITH-YOUR-SERVICE')) {
  throw new Error('Replace the placeholder EXPO_PUBLIC_API_URL in mobile/eas.json first.');
}

// Android app + web build (Vercel). No iOS-specific settings on purpose.
export default ({ config, projectRoot }: ConfigContext): ExpoConfig => ({
  ...config,
  // Display name on the phone (launcher, notifications). The package id stays the same.
  name: 'ETanim',
  slug: 'smart-greenhouse',
  version: '0.1.0',
  scheme: 'smartgreenhouse',
  platforms: ['android', 'web'],
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
    ...(existsSync(join(projectRoot, GOOGLE_SERVICES_FILE))
      ? { googleServicesFile: GOOGLE_SERVICES_FILE }
      : {}),
  },
  web: {
    // A single-page app (one index.html; vercel.json sends every path to it).
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
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
          // Only for a plain-HTTP development backend (see allowCleartext above).
          usesCleartextTraffic: allowCleartext,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
