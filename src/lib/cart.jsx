// The cart. Components use useCart(); the shape is the same in both modes:
//   { items, count, subtotal, mrpTotal, open, setOpen, add, setQty, remove, clear,
//     checkout, pending, error, analyticsCart }
//
// Shopify mode (Shopify's scripts are on the page): the cart lives in Shopify from
// the first add, held by Hydrogen's cart store and found by a cart cookie on our
// domain. Cart changes go through Shopify's Standard Actions, which also report
// add to cart / remove from cart to Shopify Analytics (useCartAnalytics).
// Checkout opens /checkout, which our server turns into the cart's Shopify checkout.
//
// Local mode (no Shopify, or a build without Shopify's scripts): lines are kept in
// localStorage; with Shopify connected, checkout creates a Shopify cart from them.
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createCartComponents, useCartAnalytics } from '@shopify/hydrogen/react'
import { getProductById, getProductByVariant, getStock, isLive } from './catalog'
import { shopifyScriptsLoaded, trackAddToCart, trackCartView } from './analytics'
import { attributionAttributes } from './attribution'
import { createCart } from './shopify'

const STORAGE_KEY = 'hakiman-demo-cart-v1'
const CartContext = createContext(null)

export function CartProvider({ children }) {
  return isLive() && shopifyScriptsLoaded()
    ? <ShopifyCartProvider>{children}</ShopifyCartProvider>
    : <LocalCartProvider>{children}</LocalCartProvider>
}

export function useCart() {
  return useContext(CartContext)
}

const variantOf = (product, variantId) => product.variants.find((v) => v.id === variantId) || product.variants[0]

/* ───────── Shopify mode ───────── */

const ShopifyCart = createCartComponents()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const money = (m) => (m ? Number(m.amount) : null)

// A cart line whose product isn't in our catalog (e.g. added in another tab after a
// catalog change) still shows, built from what Shopify returns.
function lineProduct(line) {
  const m = line.merchandise
  return getProductByVariant(m.id) || {
    id: m.product?.id || m.id,
    handle: m.product?.handle || '',
    title: m.product?.title || m.title || 'Item',
    images: m.image?.url ? [m.image.url] : ['/assets/fab.png'],
    variants: [{ id: m.id, title: m.title, price: money(line.cost.amountPerQuantity) }],
    description: [],
    features: [],
  }
}

function firstError(errors) {
  if (!errors) return null
  const groups = [errors.cart, ...errors.lines.values(), ...errors.discountCodes.values(), ...errors.attributes.values()]
  return groups.flatMap((g) => g.userErrors)[0]?.message || (errors.network.length ? 'We couldn’t update your cart. Please try again.' : null)
}

function ShopifyCartProvider({ children }) {
  return (
    <ShopifyCart.CartProvider>
      <ShopifyCartState>{children}</ShopifyCartState>
    </ShopifyCart.CartProvider>
  )
}

function ShopifyCartState({ children }) {
  useCartAnalytics()
  const data = ShopifyCart.useCart((s) => s.data)
  const loading = ShopifyCart.useCart((s) => s.loading)
  const pending = ShopifyCart.useCart((s) => s.pending)
  const revalidating = ShopifyCart.useCart((s) => s.revalidating)
  const errors = ShopifyCart.useCart((s) => s.errors)
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(0)

  const latest = useRef({ data, loading })
  latest.current = { data, loading }
  // One change at a time: the first add creates the cart, and a second change sent
  // before it settles would create another cart.
  const queue = useRef(Promise.resolve())
  const run = useCallback((fn) => {
    const next = queue.current.catch(() => {}).then(fn)
    queue.current = next
    return next
  }, [])

  // Waits until Shopify's cart actions are wired to our /api/cart and the cart has loaded.
  const updateCart = useCallback(async (payload) => {
    for (let i = 0; i < 300; i++) {
      const update = window.Shopify?.actions?.updateCart
      if (update && !update.isDefault() && !latest.current.loading) return update(payload)
      await sleep(50)
    }
    throw new Error('The cart did not load. Please refresh the page.')
  }, [])

  const lines = data?.lines?.nodes ?? []
  const lineFor = (variantId) => lines.find((l) => l.merchandise?.id === variantId)

  // One-time move of a cart saved by the previous (local) cart.
  useEffect(() => {
    let saved
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      return
    }
    const move = Array.isArray(saved) ? saved.filter((l) => String(l.variantId).startsWith('gid://shopify/ProductVariant/') && l.qty > 0) : []
    if (move.length) run(() => updateCart({ lines: move.map((l) => ({ merchandiseId: l.variantId, quantity: l.qty })) })).catch(() => {})
  }, [run, updateCart])

  // Saves where the visit came from on the cart, once per cart.
  const attributed = useRef(null)
  useEffect(() => {
    const id = data?.id
    if (!id || attributed.current === id || pending.attributes) return
    attributed.current = id
    const source = attributionAttributes()
    const existing = data.attributes ?? []
    if (!source.length || existing.some((a) => a.key === '_landing_page')) return
    const keep = existing.filter((a) => !source.some((s) => s.key === a.key)).map((a) => ({ key: a.key, value: a.value ?? '' }))
    run(() => updateCart({ attributes: [...keep, ...source] })).catch(() => {})
  }, [data, pending.attributes, run, updateCart])

  const settled = !loading && !revalidating && !pending.cost && pending.lines.size === 0

  useEffect(() => {
    if (open && settled) trackCartView(lines.length ? data : null)
    // Only when the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const value = useMemo(() => {
    const items = lines.map((line) => {
      const product = lineProduct(line)
      const base = variantOf(product, line.merchandise.id)
      const price = money(line.cost.amountPerQuantity) ?? base.price
      const variant = { ...base, price, compareAtPrice: money(line.cost.compareAtAmountPerQuantity) ?? base.compareAtPrice }
      return {
        lineId: line.id,
        productId: product.id,
        variantId: line.merchandise.id,
        qty: line.quantity,
        product,
        variant,
        lineTotal: money(line.cost.totalAmount) ?? price * line.quantity,
        stock: getStock(product.id, line.merchandise.id) || line.quantity,
        pending: pending.lines.has(line.id),
      }
    })
    const clamp = (productId, variantId, qty) => Math.max(0, Math.min(qty, getStock(productId, variantId) || qty))

    const add = (product, qty = 1, { openDrawer = true, variantId } = {}) => {
      const variant = variantOf(product, variantId)
      if (getStock(product.id, variant.id) < 1) return
      const inCart = lineFor(variant.id)?.quantity ?? 0
      const quantity = clamp(product.id, variant.id, inCart + qty) - inCart
      if (quantity < 1) {
        if (openDrawer) setOpen(true)
        return
      }
      trackAddToCart(product, variant, quantity)
      if (openDrawer) setOpen(true)
      setAdding((n) => n + 1)
      run(() => updateCart({ lines: [{ merchandiseId: variant.id, quantity }] }))
        .catch((err) => console.error(err))
        .finally(() => setAdding((n) => n - 1))
    }

    const setQty = (variantId, qty) => {
      const line = lineFor(variantId)
      if (!line) return
      const product = lineProduct(line)
      run(() => updateCart({ lines: [{ id: line.id, quantity: clamp(product.id, variantId, qty) }] })).catch((err) => console.error(err))
    }

    return {
      items,
      count: data?.totalQuantity ?? 0,
      subtotal: money(data?.cost?.subtotalAmount) ?? 0,
      mrpTotal: items.reduce((n, i) => n + (i.variant.compareAtPrice || i.variant.price) * i.qty, 0),
      open,
      setOpen,
      add,
      setQty,
      remove: (variantId) => setQty(variantId, 0),
      clear: () => lines.forEach((l) => run(() => updateCart({ lines: [{ id: l.id, quantity: 0 }] })).catch(() => {})),
      loading,
      // Totals are being recalculated by Shopify; show them as unconfirmed.
      pending: !settled || adding > 0,
      error: firstError(errors),
      analyticsCart: lines.length ? data : null,
      // Applies the typed code, then opens Shopify checkout. A code Shopify doesn't
      // accept yet returns { codeApplicable: false } without leaving, unless `force`
      // (some codes, e.g. free shipping, only apply once the address is entered).
      checkout: async (discountCode, { force = false } = {}) => {
        await queue.current.catch(() => {})
        const code = discountCode?.trim()
        const current = data?.discountCodes?.map((d) => d.code) ?? []
        if (code || current.length) {
          const result = await run(() => updateCart({ discountCodes: code ? [code] : [] }))
          const applied = result?.cart?.discountCodes?.find((d) => d.code.toLowerCase() === code?.toLowerCase())
          if (code && !applied?.applicable && !force) return { codeApplicable: false }
        }
        window.location.assign('/checkout')
        return { codeApplicable: code ? true : null }
      },
    }
  }, [lines, data, open, pending, settled, adding, errors, loading, run, updateCart]) // eslint-disable-line react-hooks/exhaustive-deps

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

/* ───────── Local mode ───────── */

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((l) => l && l.variantId && l.qty > 0) : []
  } catch {
    return []
  }
}

const clampQty = (productId, variantId, qty) => Math.max(0, Math.min(qty, getStock(productId, variantId)))

function reducer(lines, action) {
  switch (action.type) {
    case 'add': {
      const existing = lines.find((l) => l.variantId === action.variantId)
      if (existing) {
        return lines.map((l) =>
          l === existing ? { ...l, qty: clampQty(l.productId, l.variantId, l.qty + action.qty) } : l,
        )
      }
      return [...lines, { productId: action.productId, variantId: action.variantId, qty: clampQty(action.productId, action.variantId, action.qty) }]
    }
    case 'set':
      return lines
        .map((l) => (l.variantId === action.variantId ? { ...l, qty: clampQty(l.productId, l.variantId, action.qty) } : l))
        .filter((l) => l.qty > 0)
    case 'remove':
      return lines.filter((l) => l.variantId !== action.variantId)
    case 'clear':
      return []
    default:
      return lines
  }
}

function LocalCartProvider({ children }) {
  const [lines, dispatch] = useReducer(reducer, undefined, load)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // storage unavailable (private mode) — cart still works for this session
    }
  }, [lines])

  const add = useCallback((product, qty = 1, { openDrawer = true, variantId } = {}) => {
    const variant = variantOf(product, variantId)
    if (getStock(product.id, variant.id) < 1) return
    dispatch({ type: 'add', productId: product.id, variantId: variant.id, qty })
    trackAddToCart(product, variant, qty)
    if (openDrawer) setOpen(true)
  }, [])

  const value = useMemo(() => {
    // Lines whose product isn't in the current catalog are skipped, not deleted, so
    // a catalog that failed to load once doesn't wipe the saved cart.
    const items = lines.flatMap((l) => {
      const product = getProductById(l.productId)
      const variant = product?.variants.find((v) => v.id === l.variantId)
      if (!variant) return []
      return [{ ...l, product, variant, lineTotal: variant.price * l.qty, stock: getStock(l.productId, l.variantId), pending: false }]
    })
    return {
      items,
      count: items.reduce((n, i) => n + i.qty, 0),
      subtotal: items.reduce((n, i) => n + i.lineTotal, 0),
      mrpTotal: items.reduce((n, i) => n + (i.variant.compareAtPrice || i.variant.price) * i.qty, 0),
      open,
      setOpen,
      add,
      setQty: (variantId, qty) => dispatch({ type: 'set', variantId, qty }),
      remove: (variantId) => dispatch({ type: 'remove', variantId }),
      clear: () => dispatch({ type: 'clear' }),
      loading: false,
      pending: false,
      error: null,
      analyticsCart: null,
      // Null until Shopify is connected; the cart page shows the demo notice instead.
      checkout: isLive()
        ? async (discountCode, { force = false } = {}) => {
            const cart = await createCart(items, discountCode)
            if (cart.codeApplicable === false && !force) return cart
            window.location.assign(cart.checkoutUrl)
            return cart
          }
        : null,
    }
  }, [lines, open, add])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
