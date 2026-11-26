// 앱 시작점: 글꼴과 스타일(proto.css 위에 luxe.css)을 불러오고, App을 HashRouter로 감싸 #root에 그린다.
// StrictMode는 개발 중에만 화면을 두 번 그려 보며 실수를 찾아 준다 (배포 빌드에는 영향 없음).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import '@fontsource/noto-sans-kr/400.css'
import '@fontsource/noto-sans-kr/500.css'
import '@fontsource/noto-sans-kr/700.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/dm-serif-display/400-italic.css'
import '@fontsource/bodoni-moda/400.css'
import '@fontsource/bodoni-moda/500.css'
import '@fontsource/bodoni-moda/400-italic.css'
import '@fontsource/noto-sans-kr/300.css'
import './styles/proto.css'
import './styles/luxe.css'
import App from './App'

// HashRouter: Capacitor로 앱에 넣었을 때도 화면 이동이 깨지지 않게 주소에 #을 쓴다
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
