/**
 * Lazy Singleton Google Maps JavaScript API Loader
 * ------------------------------------------------
 * Injects the Maps JS API `<script>` once on demand when the user opens the Map tab,
 * avoiding extra network overhead on the Horizon landing page or Discover/Timeline tabs.
 */

let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps requires a browser environment'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (loadPromise) {
    return loadPromise;
  }

  if (!apiKey) {
    return Promise.reject(new Error('Missing VITE_GOOGLE_MAPS_API_KEY'));
  }

  loadPromise = new Promise((resolve, reject) => {
    const callbackName = '__vesperGoogleMapsInit';
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        loadPromise = null;
        reject(new Error('Google Maps initialized without window.google.maps'));
      }
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&v=weekly&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load Google Maps JavaScript API script'));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
