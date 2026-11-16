// Catalog data layer. The UI only talks to these functions. With Shopify configured,
// loadCatalog() pulls live products before the first render; otherwise the local
// JSON snapshot and demo stock are used.
import products from '../data/products.json'
import inventory from '../data/demo/inventory.json'
import { fetchShopSettings, fetchShopifyProducts, shopifyEnabled } from './shopify'

// Display order follows the source homepage "Our Complete Range" grid.
const SOURCE_ORDER = ['hk-24', 'hk-23', 'hk-22', 'hk-21', 'hk-13', 'hk-12', 'hk-11', 'hk-10']

const sortBySource = (list) => [...list].sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id))

let catalog = sortBySource(products)
let live = false
let settings = { freeShippingThreshold: null }

// Caps the quantity stepper. The store keeps selling past zero stock, so the
// tracked count isn't a cap; Shopify still enforces stock at checkout for any
// product set to stop selling when out of stock.
const LIVE_MAX_QTY = 10
// A tracked variant at or below this count shows the "Only N left" notice.
export const LOW_STOCK_AT = 10

const money = (m) => (m ? Number(m.amount) : null)

// Shopify trims leading/trailing dashes from handles (PASHOYA's ends in "-g-").
const sameHandle = (a, b) => a.replace(/^-+|-+$/g, '') === b.replace(/^-+|-+$/g, '')

// Live price, variants and availability come from Shopify. Editorial content
// (highlights, features, ingredients, design images) stays in products.json,
// matched by handle, until it is moved to metafields.
function fromShopify(sp) {
  // By handle, falling back to SKU so a handle renamed in Shopify still finds its content.
  const sku = sp.variants.nodes[0]?.sku
  const local =
    products.find((p) => sameHandle(p.handle, sp.handle)) ||
    (sku ? products.find((p) => p.variants.some((v) => v.sku === sku)) : undefined)
  const variants = sp.variants.nodes.map((v) => ({
    id: v.id,
    title: v.title,
    price: money(v.price),
    compareAtPrice: money(v.compareAtPrice),
    sku: v.sku,
    available: v.availableForSale,
    // null when inventory isn't tracked (or the storefront can't read it)
    quantity: v.quantityAvailable ?? null,
    // out of stock but still orderable (Shopify "continue selling when out of stock")
    backorder: Boolean(v.currentlyNotInStock),
  }))
  const base = local || {
    id: sp.id,
    handle: sp.handle,
    description: sp.description.split(/\n\s*\n/).filter(Boolean),
    keyBenefits: null,
    features: [],
    highlights: [],
    category: sp.productType,
    badge: null,
    brand: sp.vendor,
    ingredients: null,
    usageInstructions: null,
    precautions: null,
    faqs: [],
    reviews: [],
    isDemo: false,
  }
  return {
    ...base,
    shopifyId: sp.id,
    title: sp.title,
    price: variants[0].price,
    compareAtPrice: variants[0].compareAtPrice,
    currency: sp.variants.nodes[0].price.currencyCode,
    images: local ? local.images : sp.images.nodes.map((i) => i.url),
    sku: variants[0].sku,
    variants,
    availability: sp.availableForSale ? 'in_stock' : 'out_of_stock',
    saleEndsAt: sp.saleEndsAt?.value ? new Date(sp.saleEndsAt.value) : null,
    seo: sp.seo,
  }
}

export async function loadCatalog() {
  if (!shopifyEnabled) return
  try {
    const [remote, shop] = await Promise.all([fetchShopifyProducts(), fetchShopSettings().catch(() => settings)])
    catalog = sortBySource(remote.map(fromShopify))
    settings = shop
    live = true
  } catch (err) {
    console.error('Shopify catalog failed to load; using the local snapshot.', err)
  }
}

export const isLive = () => live
export const getSettings = () => settings

// Category descriptors describe the product format only — no health claims.
export const CATEGORY_INFO = {
  Soap: { label: 'Hand Made Soaps', blurb: 'Herbal soaps for everyday bathing.' },
  Syrup: { label: 'Syrups', blurb: 'Ayurvedic herbal formulations in syrup form.' },
  Tablet: { label: 'Capsules', blurb: 'Ayurvedic formulations, 30 capsules per pack.' },
  Powder: { label: 'Bath Salt', blurb: 'A mineral bath and foot soak blend.' },
}

export function getProducts() {
  return catalog
}

export function getProduct(handle) {
  return catalog.find((p) => sameHandle(p.handle, handle)) || null
}

export function getProductById(id) {
  return catalog.find((p) => p.id === id) || null
}

export function getProductByVariant(variantId) {
  return catalog.find((p) => p.variants.some((v) => v.id === variantId)) || null
}

export function getCategories() {
  const counts = {}
  for (const p of catalog) counts[p.category] = (counts[p.category] || 0) + 1
  return Object.keys(CATEGORY_INFO)
    .filter((c) => counts[c])
    .map((c) => ({ id: c, count: counts[c], ...CATEGORY_INFO[c], cover: catalog.find((p) => p.category === c).images[0] }))
}

export function getRelated(product, limit = 4) {
  const same = catalog.filter((p) => p.id !== product.id && p.category === product.category)
  const rest = catalog.filter((p) => p.id !== product.id && p.category !== product.category)
  return [...same, ...rest].slice(0, limit)
}

export function searchProducts(query) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return catalog.filter((p) =>
    [p.title, p.category, CATEGORY_INFO[p.category]?.label, p.ingredients, ...p.features, ...p.description]
      .filter(Boolean)
      .some((s) => s.toLowerCase().includes(q)),
  )
}

// Live: the quantity cap for an orderable variant, 0 when Shopify won't sell it.
// Otherwise demo-only stock, kept apart from the real catalog fields.
export function getStock(id, variantId) {
  if (!live) return inventory.stock[id] ?? 0
  const p = getProductById(id)
  const v = p?.variants.find((x) => x.id === variantId) || p?.variants[0]
  if (!v?.available) return 0
  return LIVE_MAX_QTY
}

// "Only N left" count, only when Shopify reports genuinely low tracked stock.
export function lowStock(variant) {
  return live && variant?.available && variant.quantity > 0 && variant.quantity <= LOW_STOCK_AT ? variant.quantity : null
}

// A sale end date set on the product (metafield custom.sale_ends_at) that hasn't passed yet.
export const activeSaleEnd = (p) => (p.saleEndsAt && p.saleEndsAt > Date.now() ? p.saleEndsAt : null)
export const saleExpired = (p) => Boolean(p.saleEndsAt && p.saleEndsAt <= Date.now())

export function shortTitle(p) {
  // Source cards use the full title; for the long PASHOYA title keep the part before the dash for tight UI.
  return p.title.split(' – ')[0]
}

// Pack name (e.g. "2 Jars") for products with options; null for single-variant products.
export const variantLabel = (p, v) => (p.variants.length > 1 ? v.title : null)

export function summary(p) {
  return p.description[0]?.split('. ')[0].replace(/\.$/, '') + '.'
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
export const formatPrice = (n) => inr.format(n)

export function discount(p) {
  if (!p.compareAtPrice || p.compareAtPrice <= p.price) return null
  return {
    percent: Math.round((1 - p.price / p.compareAtPrice) * 100),
    save: p.compareAtPrice - p.price,
  }
}
