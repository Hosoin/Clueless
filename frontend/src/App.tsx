import { Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Closet from './pages/Closet'
import Calendar from './pages/Calendar'
import Community from './pages/Community'
import Post from './pages/Post'
import My from './pages/My'
import Settings from './pages/Settings'
import Login from './pages/Login'
import Onboard from './pages/Onboard'

// 화면 주소. 새 화면은 여기에 Route를 하나 추가한다.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="closet" element={<Closet />} />
        <Route path="upload" element={<Upload />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="community" element={<Community />} />
        <Route path="post/:id" element={<Post />} />
        <Route path="my" element={<My />} />
        <Route path="settings" element={<Settings />} />
        <Route path="login" element={<Login />} />
        <Route path="onboard" element={<Onboard />} />
      </Route>
    </Routes>
  )
}
