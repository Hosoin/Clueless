import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
// npm run dev:phone → 폰에서 볼 수 있게 https로 켬. 카메라 권한 요청은 https(또는 localhost)에서만 뜬다.
export default defineConfig(({ mode }) => {
  // .env.local의 API_PROXY_TARGET으로 백엔드(closet-service) 주소를 바꿀 수 있고, 없으면 내 컴퓨터의 8081 포트를 쓴다.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: './', // Capacitor 앱 안에서도 파일 경로가 맞게
    plugins: [react(), ...(mode === 'phone' ? [basicSsl()] : [])],
    server: {
      // Cloudflare 임시 터널(https://*.trycloudflare.com)로 폰에서 경고 없이 열 수 있게 허용
      allowedHosts: ['.trycloudflare.com'],
      // 개발 서버가 /api 요청을 백엔드로 대신 전달한다. 브라우저에게는 같은 출처(localhost:5173)로 보여서
      // 백엔드에 CORS 설정이 없어도 로그인 쿠키가 같이 가고, https로 연 폰 화면에서 http 백엔드를 불러도 막히지 않는다.
      proxy: { '/api': env.API_PROXY_TARGET || 'http://localhost:8081' },
    },
  }
})
