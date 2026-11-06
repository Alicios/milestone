import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { devPatientApi } from './server/devPatientApi'

export default defineConfig(({ mode }) => ({
  plugins: [react(), devPatientApi(loadEnv(mode, process.cwd(), ''))],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
}))
