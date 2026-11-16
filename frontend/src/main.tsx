import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initClientContext } from './audio/clientRole'
// Self-hosted fonts (was: Google Fonts CDN) - the UI must look the same
// with no internet connection. Weight css files include Cyrillic subsets.
import '@fontsource/cinzel/500.css'
import '@fontsource/cinzel/700.css'
import '@fontsource/cinzel/900.css'
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './index.css'

initClientContext()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
