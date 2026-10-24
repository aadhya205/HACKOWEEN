import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { InvestigationProvider } from './context/InvestigationContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InvestigationProvider>
      <App />
    </InvestigationProvider>
  </StrictMode>,
)
