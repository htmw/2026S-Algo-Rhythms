/**
 * Central API key store for demo tenant switching.
 *
 * Resolution order:
 *   1. sessionStorage override (set by the tenant switcher UI)
 *   2. URL parameter ?key=xxx (for passing key via demo script)
 *   3. VITE_API_KEY env var (from apps/dashboard/.env)
 */

const STORAGE_KEY = 'notifyengine_api_key_override';

function resolveKey(): string {
  // 1. sessionStorage override from a previous switch
  const stored = sessionStorage.getItem(STORAGE_KEY);
  if (stored) return stored;

  // 2. URL parameter ?key=xxx
  const params = new URLSearchParams(window.location.search);
  const urlKey = params.get('key');
  if (urlKey) {
    sessionStorage.setItem(STORAGE_KEY, urlKey);
    return urlKey;
  }

  // 3. env var fallback
  return import.meta.env.VITE_API_KEY ?? '';
}

let currentKey = resolveKey();

export function getApiKey(): string {
  return currentKey;
}

export function setApiKey(key: string): void {
  currentKey = key;
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearApiKeyOverride(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  currentKey = import.meta.env.VITE_API_KEY ?? '';
}
