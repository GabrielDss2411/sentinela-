/**
 * Where the server functions live. Empty means same origin (Vite dev server or Vercel).
 * The Android app has no server of its own, so its build sets VITE_API_BASE to the
 * public API (e.g. https://api.example.com). See docs/DOCUMENTACAO.md "App Android".
 */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) ?? '').replace(/\/+$/, '');
