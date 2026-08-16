/**
 * Safely wraps or overrides window.fetch across various browser, WebView, and iframe environments.
 * Handles environments where window.fetch has only a getter or is non-writable.
 */
export function safeOverrideFetch(
  wrapper: (originalFetch: typeof window.fetch) => typeof window.fetch
): (() => void) | null {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return null;
  }

  try {
    const originalFetch = window.fetch.bind(window);
    const customFetch = wrapper(originalFetch);

    let assigned = false;

    // Try direct assignment first
    try {
      window.fetch = customFetch;
      assigned = true;
    } catch {
      // If direct assignment fails, try Object.defineProperty
      try {
        Object.defineProperty(window, 'fetch', {
          value: customFetch,
          writable: true,
          configurable: true,
          enumerable: true,
        });
        assigned = true;
      } catch (defineErr) {
        console.warn('[Fetch] Could not override window.fetch in current environment:', defineErr);
        return null;
      }
    }

    if (!assigned) return null;

    return () => {
      try {
        window.fetch = originalFetch;
      } catch {
        try {
          Object.defineProperty(window, 'fetch', {
            value: originalFetch,
            writable: true,
            configurable: true,
            enumerable: true,
          });
        } catch {}
      }
    };
  } catch (err) {
    console.warn('[Fetch] Safe fetch override setup error:', err);
    return null;
  }
}
