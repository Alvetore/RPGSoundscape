import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initClientContext } from './audio/clientRole'
import './index.css'

initClientContext()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
