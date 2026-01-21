import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import Main from './socket-component/main'
import WebRTCTest from './webrtc-test/WebRTCTest'

function App() {
  return (
    <BrowserRouter>
      <nav className="p-4 bg-gray-800 text-white">
        <div className="container mx-auto flex gap-4">
          <Link to="/" className="hover:underline">Browser</Link>
          <Link to="/webrtc-test" className="hover:underline">WebRTC Test</Link>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Main />} />
        <Route path="/webrtc-test" element={<WebRTCTest />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
