import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Atlas as AtlasData, RuntimeTraceBundle } from '@codeville/core'
import { Atlas } from './Atlas.js'

declare global {
  interface Window {
    __CODEVILLE_ATLAS__?: AtlasData
    __CODEVILLE_RUNTIME__?: RuntimeTraceBundle
  }
}

const data = window.__CODEVILLE_ATLAS__
const mount = document.getElementById('root')

if (!data) throw new Error('codeville: no atlas payload found in this document')
if (!mount) throw new Error('codeville: no #root element to mount into')

export function StandaloneAtlas({ atlas }: { atlas: AtlasData }) {
  const [runtime, setRuntime] = useState<RuntimeTraceBundle | undefined>(() => window.__CODEVILLE_RUNTIME__)

  if (runtime !== undefined) {
    const clearRuntime = () => {
      window.__CODEVILLE_RUNTIME__ = undefined
      setRuntime(undefined)
    }
    return (
      <Atlas
        atlas={atlas}
        runtime={runtime}
        initialMode="runtime"
        onClearRuntime={clearRuntime}
        caption="Local source atlas / read-only projection"
      />
    )
  }

  return <Atlas atlas={atlas} caption="Local source atlas / read-only projection" />
}

createRoot(mount).render(<StandaloneAtlas atlas={data} />)
