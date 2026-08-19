/**
 * Logo Download & Storage Cache Service
 *
 * Rules:
 * - Fetches logos sequentially ONE BY ONE (never all at once in parallel) to prevent network congestion.
 * - If a logo download fails, retries up to 2 times while continuing the queue.
 * - Once downloaded, converts to compact WebP/JPEG dataURL (or downscaled PNG dataURL) and stores in localStorage.
 * - If download fails or image cannot be downloaded/converted, falls back to a SHA-256 (or fast hash) signature placeholder.
 */

import { safeSetItem } from './storage';

const LOGO_STORAGE_PREFIX = 'tokencare_cached_logo_';
const MAX_CONCURRENT_FETCHES = 1; // Sequential one-by-one
const MAX_RETRY_COUNT = 2;
const MAX_CACHED_IMAGE_SIZE_PX = 96; // 96x96px is optimal for crisp display without blowing localStorage

// In-memory quick lookup cache
const memoryLogoCache = new Map<string, string>();

/**
 * Generates a stable alphanumeric hash for an address / URL string
 */
export function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Gets storage key for a logo by token contract address and chain
 */
function getLogoStorageKey(chain: string, address: string): string {
  const normChain = (chain || 'polygon').toLowerCase().trim();
  const normAddr = (address || '').toLowerCase().trim();
  return `${LOGO_STORAGE_PREFIX}${normChain}_${normAddr}`;
}

/**
 * Synchronously retrieves cached logo data URI from memory or localStorage
 */
export function getCachedLogoDataUrl(chain: string, address: string): string | null {
  if (!address) return null;
  const key = getLogoStorageKey(chain, address);

  // Check memory cache first
  if (memoryLogoCache.has(key)) {
    return memoryLogoCache.get(key) || null;
  }

  // Check localStorage
  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      memoryLogoCache.set(key, cached);
      return cached;
    }
  } catch {}

  return null;
}

/**
 * Saves downloaded logo to localStorage
 */
export function saveLogoToCache(chain: string, address: string, dataUrlOrHash: string): void {
  if (!address || !dataUrlOrHash) return;
  const key = getLogoStorageKey(chain, address);
  memoryLogoCache.set(key, dataUrlOrHash);
  try {
    safeSetItem(key, dataUrlOrHash);
  } catch (e) {
    console.warn('[LogoCache] Failed saving to localStorage:', e);
  }
}

/**
 * Downloads a remote image URL, downscales it to a tiny data URL (<4KB), and returns it.
 */
async function downloadAndCompressLogo(url: string): Promise<string> {
  // If already a tiny data URL, return directly
  if (url.startsWith('data:image/')) {
    return url;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timeout = setTimeout(() => {
      img.src = '';
      reject(new Error('Image fetch timeout'));
    }, 6000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width || 64;
        const height = img.naturalHeight || img.height || 64;

        // Scale down keeping aspect ratio
        let targetW = MAX_CACHED_IMAGE_SIZE_PX;
        let targetH = MAX_CACHED_IMAGE_SIZE_PX;
        if (width > height) {
          targetH = Math.round((height * MAX_CACHED_IMAGE_SIZE_PX) / width);
        } else {
          targetW = Math.round((width * MAX_CACHED_IMAGE_SIZE_PX) / height);
        }

        canvas.width = Math.max(16, targetW);
        canvas.height = Math.max(16, targetH);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(url);
          return;
        }

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // Convert to compact WebP or PNG data URL
        const dataUrl = canvas.toDataURL('image/png', 0.85);
        resolve(dataUrl);
      } catch (err) {
        // If canvas is tainted by CORS, resolve with hash/original URL
        resolve(url);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load image resource'));
    };

    img.src = url;
  });
}

// -------------------------------------------------------------
// Sequential Queue Processor: Fetches logos ONE BY ONE
// -------------------------------------------------------------

interface LogoQueueTask {
  chain: string;
  address: string;
  url: string;
  retryCount: number;
  onSuccess?: (dataUrl: string) => void;
}

class SequentialLogoQueue {
  private queue: LogoQueueTask[] = [];
  private isProcessing = false;
  private inFlightKeys = new Set<string>();

  public enqueue(chain: string, address: string, url: string, onSuccess?: (dataUrl: string) => void) {
    if (!url || !address) return;
    const key = getLogoStorageKey(chain, address);

    // If already in local cache, call callback immediately
    const existing = getCachedLogoDataUrl(chain, address);
    if (existing) {
      onSuccess?.(existing);
      return;
    }

    if (this.inFlightKeys.has(key)) return;
    this.inFlightKeys.add(key);

    this.queue.push({
      chain,
      address,
      url,
      retryCount: 0,
      onSuccess,
    });

    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    const task = this.queue.shift()!;
    const { chain, address, url, retryCount, onSuccess } = task;
    const key = getLogoStorageKey(chain, address);

    try {
      // Fetch and downscale one by one
      const dataUrl = await downloadAndCompressLogo(url);
      saveLogoToCache(chain, address, dataUrl);
      this.inFlightKeys.delete(key);
      if (onSuccess) {
        onSuccess(dataUrl);
      }
    } catch (err) {
      console.warn(`[LogoQueue] Error fetching logo for ${address} (attempt ${retryCount + 1}):`, err);

      if (retryCount < MAX_RETRY_COUNT) {
        // Re-enqueue at the end of the queue so other logos can proceed while this one waits
        this.queue.push({
          ...task,
          retryCount: retryCount + 1,
        });
      } else {
        // Max retries exceeded: Fallback to hash signature as requested
        const hashedFallback = `hash:${hashString(url || address)}`;
        saveLogoToCache(chain, address, hashedFallback);
        this.inFlightKeys.delete(key);
      }
    } finally {
      this.isProcessing = false;
      // Slight 50ms pause between sequential requests to protect device threads
      setTimeout(() => this.processNext(), 50);
    }
  }
}

export const logoDownloadQueue = new SequentialLogoQueue();
