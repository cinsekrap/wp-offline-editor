import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ScratchpadWindow } from './components/editor/ScratchpadWindow'

const params = new URLSearchParams(window.location.search)
const mode = params.get('mode')

const root = ReactDOM.createRoot(document.getElementById('root')!)

if (mode === 'scratchpad') {
  const scratchpadId = params.get('scratchpadId')
  if (!scratchpadId) {
    root.render(<div style={{ padding: 24 }}>Missing scratchpad ID</div>)
  } else {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <ScratchpadWindow scratchpadId={scratchpadId} />
        </ErrorBoundary>
      </React.StrictMode>
    )
  }
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}
