import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// handles for automated testing / power users in the console
import { useStore } from './store'
import { useFonts } from './fonts/registry'
;(window as unknown as Record<string, unknown>).__typelab = { useStore, useFonts }
