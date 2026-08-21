import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'

const mount = document.getElementById('root')
if (!mount) throw new Error('codeville: missing #root')

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
