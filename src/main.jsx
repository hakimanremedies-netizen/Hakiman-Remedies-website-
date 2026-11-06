import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CartProvider } from './lib/cart'
import { loadCatalog } from './lib/catalog'
import { initAnalytics } from './lib/analytics'
import App from './App'
import './styles/global.css'

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
