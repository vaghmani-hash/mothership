import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// A file dropped anywhere but a terminal does nothing (the window would otherwise open it).
for (const type of ['dragover', 'drop'] as const) window.addEventListener(type, (ev) => ev.preventDefault())

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
