/** Resolve backend API base URL for fetch calls. */
export function getApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8000';
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}
