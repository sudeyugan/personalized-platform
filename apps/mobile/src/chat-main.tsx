import { createRoot } from 'react-dom/client'
import { Chat } from './Chat'
import './style.css'
createRoot(document.getElementById('root')!).render(
  <div className="mobile-app mini-chat">
    <Chat />
  </div>,
)
