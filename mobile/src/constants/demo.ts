/**
 * The dev-only "Demo" button + "Presentation tools" sheet exist only when this is
 * true: in development builds (__DEV__), or in a build made with EXPO_PUBLIC_DEMO=1
 * (for presenting from an installed build). Never in a normal release build.
 *
 * Metro inlines `__DEV__` and `process.env.EXPO_PUBLIC_*` at build time, so code
 * behind a check written with these is removed from release bundles (README: "Demo tools").
 */
export const DEMO_ENABLED: boolean = __DEV__ || process.env.EXPO_PUBLIC_DEMO === '1';
