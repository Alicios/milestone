import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        // Vite only auto-detects index.html; listing it explicitly here
        // alongside patient-setup.html keeps both pages in one build/deploy.
        // Paths resolve relative to the project root, same as index.html does.
        main: 'index.html',
        patientSetup: 'patient-setup.html',
      },
    },
  },
})
