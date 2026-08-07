import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Vercel build config — session 018.
//
// WHAT CHANGED, AND WHY (01_REBUILD_PLAN.md §PHASE B.1):
//
// 1. `@base44/vite-plugin` is GONE. It is builder tooling — hmrNotifier,
//    navigationNotifier, analyticsTracker and visualEditAgent all exist to
//    wire the app into the base44 Builder iframe. None of it belongs in a
//    Vercel production build.
//
// 2. 🔴 THE `@/` ALIAS LIVED INSIDE THAT PLUGIN. Removing it without this
//    `resolve.alias` breaks all 412 `@/…` imports at once. This is the whole
//    reason §B.1 exists as a numbered step rather than a footnote.
//
// 3. `logLevel: 'error'` is GONE. base44 set it to keep the builder console
//    quiet; on Vercel it hides every Rollup warning, which is exactly the
//    output you need when a build starts failing.
//
// `@base44/sdk` is deliberately KEPT. Phase B lands the adapter delegating to
// the base44 SDK first, proving all call sites behave identically before the
// backing store is flipped per-namespace. Only two files import it today —
// src/api/base44Client.js and src/lib/AuthContext.jsx.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    // Warn rather than stay silent; the entry chunk is ~1.77 MB today and
    // §B.4 (making Game React.lazy) is the fix, not a raised threshold.
    chunkSizeWarningLimit: 2000,
  },
})
