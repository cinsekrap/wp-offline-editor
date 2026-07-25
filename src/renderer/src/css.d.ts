// TypeScript 7 (TS2882) checks side-effect imports of non-TS assets; Vite's
// client types no longer ship a `*.css` shim, so declare it here for the
// stylesheet imports handled by Vite at build time.
declare module '*.css'
