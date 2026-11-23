import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: './', // Capacitor 앱 안에서도 파일 경로가 맞게
  plugins: [react()],
})
