import { Redirect } from 'expo-router';
import { lazy, Suspense } from 'react';

// DEV ONLY. `__DEV__` is a build-time constant, so in a release build this line becomes
// `null` and the gallery code is not part of the bundle at all.
const Gallery = __DEV__ ? lazy(() => import('@/dev/Gallery')) : null;

export default function DevGalleryRoute() {
  if (!Gallery) return <Redirect href="/" />;
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  );
}
