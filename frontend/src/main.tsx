import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { FeatureProvider } from './features'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeatureProvider>
      <App />
    </FeatureProvider>
  </StrictMode>,
)
