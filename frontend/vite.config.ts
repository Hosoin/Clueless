import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// npm run dev:phone → 폰에서 볼 수 있게 https로 켬. 카메라 권한 요청은 https(또는 localhost)에서만 뜬다.
export default defineConfig(({ mode }) => ({
  base: './', // Capacitor 앱 안에서도 파일 경로가 맞게
  plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
}))
