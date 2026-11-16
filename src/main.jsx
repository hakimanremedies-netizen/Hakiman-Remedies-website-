import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CartProvider } from './lib/cart'
import { loadCatalog } from './lib/catalog'
import { initAnalytics, startShopifyScripts } from './lib/analytics'
import { captureAttribution } from './lib/attribution'
import App from './App'
import './styles/global.css'

captureAttribution()
initAnalytics()
await loadCatalog()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
)

startShopifyScripts()
