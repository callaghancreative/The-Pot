import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

// Keep the installed (home-screen) app current. `autoUpdate` swaps in the new
// service worker and reloads on its own; the visibilitychange check forces a
// fresh update check whenever the app is reopened or brought to the foreground,
// which iOS otherwise only does on a full cold launch.
const updateSW = registerSW({ immediate: true })

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') updateSW()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
