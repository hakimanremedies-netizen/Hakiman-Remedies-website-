// Catalog data layer. The UI only talks to these functions. With Shopify configured,
// loadCatalog() pulls live products before the first render; otherwise the local
// JSON snapshot and demo stock are used.
import products from '../data/products.json'
import inventory from '../data/demo/inventory.json'
import { fetchShopifyProducts, shopifyEnabled } from './shopify'

// Display order follows the source homepage "Our Complete Range" grid.
const SOURCE_ORDER = ['hk-24', 'hk-23', 'hk-22', 'hk-21', 'hk-13', 'hk-12', 'hk-11', 'hk-10']

const sortBySource = (list) => [...list].sort((a, b) => SOURCE_ORDER.indexOf(a.id) - SOURCE_ORDER.indexOf(b.id))

let catalog = sortBySource(products)
let live = false

// Shopify enforces real stock at checkout; this only caps the quantity stepper.
const LIVE_MAX_QTY = 10

const money = (m) => (m ? Number(m.amount) : null)

// Shopify trims leading/trailing dashes from handles (PASHOYA's ends in "-g-").
const sameHandle = (a, b) => a.replace(/^-+|-+$/g, '') === b.replace(/^-+|-+$/g, '')

// Live price, variants and availability come from Shopify. Editorial content
// (highlights, features, ingredients, design images) stays in products.json,
// matched by handle, until it is moved to metafields.
function fromShopify(sp) {
  const local = products.find((p) => sameHandle(p.handle, sp.handle))
  const variants = sp.variants.nodes.map((v) => ({
    id: v.id,
    title: v.title,
    price: money(v.price),
    compareAtPrice: money(v.compareAtPrice),
    sku: v.sku,
    available: v.availableForSale,
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
  }
}

export async function loadCatalog() {
  if (!shopifyEnabled) return
  try {
    const remote = await fetchShopifyProducts()
    catalog = sortBySource(remote.map(fromShopify))
    live = true
  } catch (err) {
    console.error('Shopify catalog failed to load; using the local snapshot.', err)
  }
}

export const isLive = () => live

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

// Live: Shopify availability. Otherwise demo-only stock, kept apart from the real catalog fields.
export function getStock(id) {
  if (live) return getProductById(id)?.availability === 'in_stock' ? LIVE_MAX_QTY : 0
  return inventory.stock[id] ?? 0
}

export function shortTitle(p) {
  // Source cards use the full title; for the long PASHOYA title keep the part before the dash for tight UI.
  return p.title.split(' – ')[0]
}

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
