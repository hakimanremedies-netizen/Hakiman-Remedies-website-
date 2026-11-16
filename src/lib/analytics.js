// Storefront analytics.
//
// Shopify Analytics (Live View, sessions, traffic sources, conversion funnel):
// Shopify's storefront scripts, added to <head> at build time (vite.config.js), create
// an analytics bus at window.Shopify.analytics. We publish page, product, search and
// cart views to it; cart changes are reported by the cart itself (useCartAnalytics in
// cart.jsx). Shopify's Customer Privacy API decides when events may be delivered.
//
// Meta Pixel (VITE_META_PIXEL_ID): a destination on that same bus, so it only fires
// once the visitor's consent allows it, and only for marketing-allowed visitors.
// PageView, ViewContent and AddToCart carry an event ID for deduplication.
// Checkout and Purchase come from Shopify's checkout through the Facebook & Instagram
// app, so they are never sent from here and can't be double counted.
//
// Google Analytics 4 (VITE_GA4_ID) is unchanged and off unless that ID is set.
import { AnalyticsEvent, initializeShopifyScripts } from '@shopify/hydrogen'
import { SHOPIFY_CONSENT } from './shopifyScripts'

const GA4_ID = import.meta.env.VITE_GA4_ID
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID

const bus = () => window.Shopify?.analytics ?? null
// True when the build added Shopify's scripts (i.e. Shopify is configured).
export const shopifyScriptsLoaded = () => Boolean(bus())

function loadScript(src) {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

/* ───────── Meta Pixel ───────── */

let pixelLoaded = false
function loadPixel() {
  if (pixelLoaded || !PIXEL_ID) return
  pixelLoaded = true
  const fbq = (window.fbq = function fbq() {
    fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments)
  })
  window._fbq = fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  // We send PageView ourselves on every route change (with an event ID). Stop the
  // Pixel adding its own on each history change (double counting), and stop it
  // treating our later PageViews as duplicates of the first page (under counting).
  fbq.disablePushState = true
  fbq.allowDuplicatePageViews = true
  fbq('init', PIXEL_ID)
  loadScript('https://connect.facebook.net/en_US/fbevents.js')
}

const eventId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

function pixel(event, data = {}) {
  if (!PIXEL_ID) return
  loadPixel()
  window.fbq('track', event, data, { eventID: eventId() })
}

// Shopify GIDs end in the numeric id that Meta catalogues use.
const numericId = (gid) => String(gid).split('/').pop()
// Matches the ids Shopify's Facebook & Instagram channel gives catalogue items.
const metaId = (productId, variantId) => `shopify_IN_${numericId(productId)}_${numericId(variantId)}`

function metaContent(items) {
  return {
    currency: 'INR',
    value: items.reduce((n, i) => n + i.price * i.qty, 0),
    content_type: 'product',
    content_ids: items.map((i) => metaId(i.productId, i.variantId)),
    contents: items.map((i) => ({ id: metaId(i.productId, i.variantId), quantity: i.qty })),
    num_items: items.reduce((n, i) => n + i.qty, 0),
  }
}

// Ad-tracking needs marketing consent on top of the analytics consent the bus checks.
function marketingAllowed() {
  const cp = window.Shopify?.customerPrivacy
  try {
    return typeof cp?.marketingAllowed === 'function' ? cp.marketingAllowed() : true
  } catch {
    return false
  }
}

const metaDestination = {
  name: 'meta-pixel',
  setup({ subscribe }) {
    subscribe(AnalyticsEvent.PAGE_VIEWED, () => {
      if (marketingAllowed()) pixel('PageView')
    })
    subscribe(AnalyticsEvent.PRODUCT_VIEWED, ({ products = [] }) => {
      if (!marketingAllowed() || !products.length) return
      pixel('ViewContent', metaContent(products.map((p) => ({
        productId: p.id, variantId: p.variantId, price: Number(p.price.amount), qty: p.quantity || 1,
      }))))
    })
    subscribe(AnalyticsEvent.PRODUCT_ADD_TO_CART, ({ currentLine, prevCart }) => {
      if (!marketingAllowed() || !currentLine) return
      const prevLines = prevCart?.lines?.nodes ?? prevCart?.lines?.edges?.map((e) => e.node) ?? []
      const before = prevLines.find((l) => l.id === currentLine.id)?.quantity ?? 0
      const qty = currentLine.quantity - before
      if (qty <= 0) return
      const m = currentLine.merchandise
      pixel('AddToCart', metaContent([{ productId: m.product.id, variantId: m.id, price: Number(m.price.amount), qty }]))
    })
  },
}

/* ───────── Google Analytics 4 (unchanged) ───────── */

function gaItems(lines) {
  return lines.map(({ product, variant, qty }) => ({
    item_id: variant.sku || numericId(variant.id),
    item_name: product.title,
    item_variant: product.variants.length > 1 ? variant.title : undefined,
    item_category: product.category,
    price: variant.price,
    quantity: qty,
  }))
}

function gaEvent(event, lines) {
  window.gtag?.('event', event, {
    currency: 'INR',
    value: lines.reduce((n, l) => n + l.variant.price * l.qty, 0),
    items: gaItems(lines),
  })
}

/* ───────── Public API ───────── */

export function initAnalytics() {
  if (GA4_ID) {
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() {
      window.dataLayer.push(arguments)
    }
    window.gtag('js', new Date())
    // Page views are sent by trackPageView on every route change.
    window.gtag('config', GA4_ID, { send_page_view: false })
    loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`)
  }
  // Without Shopify's scripts (local demo) the Pixel loads straight away, as before.
  if (PIXEL_ID && !bus()) loadPixel()
}

// After the first render. Starts Shopify's consent API, standard events and
// page-view observer, and connects the Meta Pixel to the bus.
export function startShopifyScripts() {
  if (!bus()) return
  initializeShopifyScripts({ consent: SHOPIFY_CONSENT, webMcp: false })
  if (PIXEL_ID) bus().addDestination(metaDestination)
}

export function trackPageView(path) {
  window.gtag?.('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title })
  if (bus()) bus().publish(AnalyticsEvent.PAGE_VIEWED)
  else if (window.fbq) pixel('PageView')
}

export function trackProductView(product, variant) {
  const line = { product, variant, qty: 1 }
  gaEvent('view_item', [line])
  if (bus()) {
    if (!product.shopifyId) return
    bus().publish(AnalyticsEvent.PRODUCT_VIEWED, {
      products: [{
        id: product.shopifyId,
        title: product.title,
        price: { amount: String(variant.price), currencyCode: product.currency || 'INR' },
        vendor: product.brand || 'Hakiman',
        variantId: variant.id,
        variantTitle: variant.title,
        quantity: 1,
        sku: variant.sku ?? null,
        productType: product.category,
      }],
    })
  } else if (window.fbq) {
    pixel('ViewContent', metaContent([{ productId: product.shopifyId || product.id, variantId: variant.id, price: variant.price, qty: 1 }]))
  }
}

// GA always; Meta only without Shopify's bus (with it, the Shopify cart reports
// add to cart itself and the Meta destination picks it up).
export function trackAddToCart(product, variant, qty) {
  gaEvent('add_to_cart', [{ product, variant, qty }])
  if (!bus() && window.fbq) {
    pixel('AddToCart', metaContent([{ productId: product.shopifyId || product.id, variantId: variant.id, price: variant.price, qty }]))
  }
}

export function trackSearch(term, totalCount) {
  if (term) bus()?.publish(AnalyticsEvent.SEARCH_VIEWED, { searchTerm: term, searchResults: { totalCount } })
}

// cart: the Shopify cart (connection-shaped lines), or null when there is none.
export function trackCartView(cart) {
  bus()?.publish(AnalyticsEvent.CART_VIEWED, { cart: cart ?? null })
}
