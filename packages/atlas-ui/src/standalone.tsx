import { createRoot } from 'react-dom/client'
import type { Atlas as AtlasData } from '@codeville/core'
import { Atlas } from './Atlas.js'

declare global {
  interface Window {
    __CODEVILLE_ATLAS__?: AtlasData
  }
}

const data = window.__CODEVILLE_ATLAS__
const mount = document.getElementById('root')

if (!data) throw new Error('codeville: no atlas payload found in this document')
if (!mount) throw new Error('codeville: no #root element to mount into')

createRoot(mount).render(<Atlas atlas={data} caption="Local source atlas / read-only projection" />)
