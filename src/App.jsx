import { useEffect, useLayoutEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import CartDrawer from './components/CartDrawer'
import Home from './pages/Home'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Story from './pages/Story'
import Ingredients from './pages/Ingredients'
import Learn from './pages/Learn'
import Contact from './pages/Contact'
import Policy from './pages/Policy'
import Checkout from './pages/Checkout'
import Account, { AccountCallback } from './pages/Account'
import NotFound from './pages/NotFound'
import { ScrollTrigger } from './lib/motion'
import { trackPageView } from './lib/analytics'
import WhatsAppButton from './components/WhatsAppButton'

function ScrollToTop() {
  const { pathname, search } = useLocation()
  // Layout effect so the new page never paints at the old scroll position.
  useLayoutEffect(() => {
    // ScrollTrigger remembers the last page's scroll and restores it on
    // refresh; forget it, and stop the browser restoring it on reload too.
    ScrollTrigger.clearScrollMemory('manual')
    window.scrollTo(0, 0)
    // Layout changes between routes; let triggers re-measure after paint.
    // refresh() can still restore its cached scroll, so reset once more after.
    const frame = requestAnimationFrame(() => {
      ScrollTrigger.refresh()
      window.scrollTo(0, 0)
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])
  // After paint so the page has set its own document.title. Query changes (shop
  // filters, search) count as page views too, as on a Shopify theme.
  useEffect(() => {
    trackPageView(pathname)
  }, [pathname, search])
  return null
}

export default function App() {
  // Product pages carry their own header and footer from the product-page design.
  const { pathname } = useLocation()
  const isProduct = pathname.startsWith('/products/')
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <ScrollToTop />
      {!isProduct && <Header />}
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/products/:handle" element={<Product />} />
          <Route path="/our-story" element={<Story />} />
          <Route path="/ingredients" element={<Ingredients />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies/:key" element={<Policy />} />
          {/* /checkout itself is served by the server and opens Shopify checkout. */}
          <Route path="/cart" element={<Checkout />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/callback" element={<AccountCallback />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      {!isProduct && <Footer />}
      {/* Product pages have their own WhatsApp button; on the cart it would cover the checkout button. */}
      {!isProduct && pathname !== '/cart' && <WhatsAppButton />}
      <CartDrawer />
    </>
  )
}
