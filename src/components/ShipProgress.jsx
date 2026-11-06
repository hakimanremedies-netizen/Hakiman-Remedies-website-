import { formatPrice, getSettings } from '../lib/catalog'

// "Add ₹X more for free shipping". The threshold is the shop metafield
// custom.free_shipping_threshold, which must match the free-shipping rate in
// Shopify's shipping settings; with no threshold set this renders nothing.
export default function ShipProgress({ subtotal }) {
  const threshold = getSettings().freeShippingThreshold
  if (!threshold || subtotal <= 0) return null
  const left = threshold - subtotal
  return (
    <div className="ship-progress" role="status">
      <p>{left > 0 ? <>Add <strong>{formatPrice(left)}</strong> more for free shipping</> : <strong>Your order ships free</strong>}</p>
      <div className="ship-progress__bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (subtotal / threshold) * 100)}%` }} />
      </div>
    </div>
  )
}
