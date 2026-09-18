import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GH Pages serves project sites from /<repo>/, so the base must match the repo
// name in CI. Locally (and on a user/org page) it stays at the root.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
})
