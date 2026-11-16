import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart } from '../lib/cart'
import { trackCartView } from '../lib/analytics'
import { formatPrice, shortTitle, variantLabel } from '../lib/catalog'
import QtyStepper from '../components/QtyStepper'
import Icon from '../components/Icon'
import ShipProgress from '../components/ShipProgress'

// Cart review. With Shopify connected, the button hands off to Shopify's hosted
// checkout; without it this page is a demo that never collects payment details.
export default function Checkout() {
  const { items, subtotal, mrpTotal, setQty, remove, count, checkout, loading, pending, error: cartError, analyticsCart } = useCart()
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState(null)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(null)
  // The code Shopify didn't accept yet; pressing the button again continues with it.
  const [warnedCode, setWarnedCode] = useState(null)
  const savings = mrpTotal - subtotal

  // Cart viewed, once the cart has loaded and settled.
  const viewed = useRef(false)
  useEffect(() => {
    if (viewed.current || loading || pending) return
    viewed.current = true
    trackCartView(analyticsCart)
  }, [loading, pending, analyticsCart])

  const goToCheckout = async () => {
    const typed = code.trim()
    setRedirecting(true)
    setError(null)
    setCodeError(null)
    try {
      const cart = await checkout(typed, { force: Boolean(typed) && typed === warnedCode })
      if (cart.codeApplicable === false) {
        setWarnedCode(typed)
        setCodeError(`“${typed}” doesn’t apply to this cart yet. Some codes (like free shipping) only apply once you enter your address at checkout. Press the button again to continue with it, or clear the code.`)
        setRedirecting(false)
      }
    } catch (err) {
      console.error(err)
      setError('We couldn’t start checkout. Please try again in a moment.')
      setRedirecting(false)
    }
  }

  if (!items.length && (loading || pending)) {
    return (
      <div className="page container checkout-empty" role="status">
        <h1>Your cart</h1>
        <p>Loading your cart…</p>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="page container checkout-empty">
        <h1>Your cart is empty</h1>
        <p>Add a remedy to your cart to continue.</p>
        <Link to="/shop" className="btn btn--primary">Explore the Collection</Link>
      </div>
    )
  }

  return (
    <div className="page container checkout">
      {!checkout && (
        <div className="demo-banner" role="note">
          <strong>Demo checkout.</strong> This prototype is not connected to a payment provider. No payment details are collected and no order is placed here.
        </div>
      )}

      <header className="checkout__head">
        <h1>Your cart</h1>
        <p>{count} {count === 1 ? 'item' : 'items'}</p>
      </header>

      <div className="checkout__grid">
        <section aria-label="Cart items">
          <ul className="cart-lines checkout__lines">
            {items.map((i) => (
              <li key={i.variantId} className={`cart-line${i.pending ? ' is-pending' : ''}`}>
                <Link to={`/products/${i.product.handle}`} className="cart-line__img">
                  <img src={i.product.images[0]} alt={i.product.title} />
                </Link>
                <div className="cart-line__body">
                  <Link to={`/products/${i.product.handle}`} className="cart-line__title">{shortTitle(i.product)}</Link>
                  {variantLabel(i.product, i.variant) && <div className="cart-line__variant">{variantLabel(i.product, i.variant)}</div>}
                  <div className="cart-line__unit">
                    {formatPrice(i.variant.price)}
                    {i.variant.compareAtPrice > i.variant.price && <s>{formatPrice(i.variant.compareAtPrice)}</s>}
                  </div>
                  <div className="cart-line__row">
                    <QtyStepper value={i.qty} max={i.stock} onChange={(q) => setQty(i.variantId, q)} label={i.product.title} allowZero />
                    <button className="link-btn" onClick={() => remove(i.variantId)}>Remove</button>
                  </div>
                </div>
                <div className="cart-line__total">{formatPrice(i.lineTotal)}</div>
              </li>
            ))}
          </ul>
          <Link to="/shop" className="checkout__continue">
            <Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} /> Continue shopping
          </Link>
        </section>

        <aside className="checkout__panel" aria-labelledby="summary-title">
          <h2 id="summary-title">Order summary</h2>
          {cartError && <p className="cart-error" role="alert">{cartError}</p>}
          <dl className={`cart-totals${pending ? ' is-pending' : ''}`} aria-busy={pending || undefined}>
            <div><dt>MRP total</dt><dd>{formatPrice(mrpTotal)}</dd></div>
            {savings > 0 && (
              <div className="cart-totals__save"><dt>Discount on MRP</dt><dd>− {formatPrice(savings)}</dd></div>
            )}
            <div><dt>Shipping</dt><dd className="cart-totals__muted">Calculated at checkout</dd></div>
            <div className="cart-totals__grand"><dt>Subtotal</dt><dd>{formatPrice(subtotal)}</dd></div>
          </dl>
          {savings > 0 && <p className="checkout__saving">You save {formatPrice(savings)} on this order</p>}
          <ShipProgress subtotal={subtotal} />

          {checkout && (
            <div className="discount-code">
              <label htmlFor="discount-code">Discount code</label>
              <div className="discount-code__row">
                <input
                  id="discount-code"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); setCodeError(null); setWarnedCode(null) }}
                  autoComplete="off"
                  spellCheck="false"
                  aria-describedby={codeError ? 'discount-code-msg' : undefined}
                />
              </div>
              {codeError
                ? <p id="discount-code-msg" className="discount-code__msg" role="alert">{codeError}</p>
                : <p className="fine">Automatic offers are applied at checkout.</p>}
            </div>
          )}

          <button
            className="btn btn--primary btn--lg btn--block"
            onClick={goToCheckout}
            disabled={!checkout || redirecting}
            aria-describedby={checkout ? undefined : 'checkout-note'}
          >
            <Icon name="lock" size={18} /> {redirecting ? 'Opening secure checkout…' : warnedCode && warnedCode === code.trim() ? 'Continue to checkout with this code' : 'Proceed to checkout'}
          </button>
          {error && <p className="checkout__error" role="alert">{error}</p>}
          {!checkout && <p id="checkout-note" className="fine">Not available in this prototype — requires Shopify connection.</p>}

          <ul className="checkout__trust">
            <li><Icon name="shield" size={18} /> Secure payments by Razorpay — UPI, cards, net banking and wallets</li>
            <li><Icon name="truck" size={18} /> Dispatched in 2–3 business days, shipping across India</li>
            <li><Icon name="leaf" size={18} /> <span>Read our <Link to="/policies/refunds">returns &amp; refunds policy</Link></span></li>
          </ul>
        </aside>
      </div>
    </div>
  )
}
