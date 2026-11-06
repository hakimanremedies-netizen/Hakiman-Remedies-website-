// Google Analytics 4 and Meta Pixel for the React site. Each loads only when its ID
// is set (VITE_GA4_ID, VITE_META_PIXEL_ID). The site reports page views, product
// views and add to cart. Checkout started and Purchase happen on Shopify's checkout
// and are reported there by the Google & YouTube and Facebook & Instagram apps
// (the latter also sends them through the Conversions API), so they are never
// sent from here and can't be double counted.
const GA4_ID = import.meta.env.VITE_GA4_ID
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID

function loadScript(src) {
  const s = document.createElement('script')
  s.async = true
  s.src = src
  document.head.appendChild(s)
}

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
  if (PIXEL_ID) {
    const fbq = (window.fbq = function fbq() {
      fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments)
    })
    window._fbq = fbq
    fbq.push = fbq
    fbq.loaded = true
    fbq.version = '2.0'
    fbq.queue = []
    fbq('init', PIXEL_ID)
    loadScript('https://connect.facebook.net/en_US/fbevents.js')
  }
}

export function trackPageView(path) {
  window.gtag?.('event', 'page_view', { page_path: path, page_location: window.location.href, page_title: document.title })
  window.fbq?.('track', 'PageView')
}

// Shopify GIDs end in the numeric id that Meta catalogues and Google Merchant use.
const numericId = (gid) => String(gid).split('/').pop()

// Matches the ids Shopify's Facebook & Instagram channel gives catalogue items.
const metaId = (l) => `shopify_IN_${numericId(l.product.shopifyId || l.product.id)}_${numericId(l.variant.id)}`

const META_EVENT = { view_item: 'ViewContent', add_to_cart: 'AddToCart' }

// lines: [{ product, variant, qty }]
export function track(event, lines, value) {
  const items = lines.map(({ product, variant, qty }) => ({
    item_id: variant.sku || numericId(variant.id),
    item_name: product.title,
    item_variant: product.variants.length > 1 ? variant.title : undefined,
    item_category: product.category,
    price: variant.price,
    quantity: qty,
  }))
  const total = value ?? lines.reduce((n, l) => n + l.variant.price * l.qty, 0)
  window.gtag?.('event', event, { currency: 'INR', value: total, items })
  window.fbq?.('track', META_EVENT[event], {
    currency: 'INR',
    value: total,
    content_type: 'product',
    content_ids: lines.map(metaId),
    contents: lines.map((l) => ({ id: metaId(l), quantity: l.qty })),
    num_items: lines.reduce((n, l) => n + l.qty, 0),
  })
}
