import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState } from 'react'
import { getProductById, getStock, isLive } from './catalog'
import { track } from './analytics'
import { createCart } from './shopify'

const STORAGE_KEY = 'hakiman-demo-cart-v1'
const CartContext = createContext(null)

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    // Drops lines whose variant no longer exists, e.g. demo ids after switching to Shopify.
    return Array.isArray(raw)
      ? raw.filter((l) => getProductById(l.productId)?.variants.some((v) => v.id === l.variantId))
      : []
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

export function CartProvider({ children }) {
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
    const variant = product.variants.find((v) => v.id === variantId) || product.variants[0]
    if (getStock(product.id, variant.id) < 1) return
    dispatch({ type: 'add', productId: product.id, variantId: variant.id, qty })
    track('add_to_cart', [{ product, variant, qty }])
    if (openDrawer) setOpen(true)
  }, [])

  const value = useMemo(() => {
    const items = lines.map((l) => {
      const product = getProductById(l.productId)
      const variant = product.variants.find((v) => v.id === l.variantId) || product.variants[0]
      return { ...l, product, variant, lineTotal: variant.price * l.qty, stock: getStock(l.productId, l.variantId) }
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
      // Null until Shopify is connected; the checkout page shows the demo notice instead.
      // Resolves to { codeApplicable: false } without leaving when a typed code is rejected.
      checkout: isLive()
        ? async (discountCode) => {
            const cart = await createCart(lines, discountCode)
            if (cart.codeApplicable === false) return cart
            window.location.assign(cart.checkoutUrl)
            return cart
          }
        : null,
    }
  }, [lines, open, add])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}
