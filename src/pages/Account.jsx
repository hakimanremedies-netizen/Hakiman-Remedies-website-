import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import demo from '../data/demo/orders.json'
import { formatPrice, getProductById, shortTitle } from '../lib/catalog'
import { accountUrl, shopifyEnabled } from '../lib/shopify'
import { customerAccountsEnabled, fetchCustomer, finishSignIn, signIn, signOut } from '../lib/customer'
import Loader from '../components/Loader'

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export default function Account() {
  if (customerAccountsEnabled) return <CustomerAccount />
  return shopifyEnabled ? <ShopifyAccount /> : <DemoAccount />
}

// Shopify sends customers back here after the email + code step.
export function AccountCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    finishSignIn(params)
      .then((to) => navigate(to, { replace: true }))
      .catch((err) => setError(err.message))
  }, [params, navigate])

  if (!error) return <Loader />
  return (
    <div className="page container checkout-empty">
      <h1>Sign-in didn’t complete</h1>
      <p>{error}</p>
      <button className="btn btn--primary" onClick={() => signIn()}>Try again</button>
    </div>
  )
}

const STATUS_LABEL = {
  PAID: 'Paid',
  PENDING: 'Payment pending',
  AUTHORIZED: 'Authorized',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
  VOIDED: 'Cancelled',
}

function CustomerAccount() {
  // undefined = loading, null = signed out
  const [customer, setCustomer] = useState(undefined)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCustomer()
      .then(setCustomer)
      .catch((err) => {
        console.error(err)
        setError('We couldn’t load your account. Please sign in again.')
        setCustomer(null)
      })
  }, [])

  if (customer === undefined) return <Loader />

  if (!customer) {
    return (
      <div className="page container checkout-empty">
        <h1>Your account</h1>
        <p>{error || 'Sign in with your email to see your orders and delivery address. We’ll send you a one-time code — no password needed.'}</p>
        <button className="btn btn--primary btn--lg" onClick={() => signIn()}>Sign in</button>
      </div>
    )
  }

  const orders = customer.orders.nodes

  return (
    <div className="page container account">
      <div className="account__head">
        <div>
          <h1>{customer.firstName ? `Hello, ${customer.firstName}` : 'Your account'}</h1>
          <p className="account__meta">{customer.emailAddress?.emailAddress}</p>
        </div>
        <button className="btn btn--ghost btn--small" onClick={signOut}>Sign out</button>
      </div>

      {customer.defaultAddress && (
        <section className="account__address">
          <h2>Delivery address</h2>
          <address>{customer.defaultAddress.formatted.join(', ')}</address>
        </section>
      )}

      <h2 className="account__orders-title">Your orders</h2>
      {orders.length === 0 ? (
        <div className="order">
          <p>You haven’t placed an order yet.</p>
          <Link to="/shop" className="btn btn--primary btn--small">Explore the Collection</Link>
        </div>
      ) : (
        <ul className="orders">
          {orders.map((o) => (
            <li key={o.id} className="order">
              <header className="order__head">
                <div>
                  <strong>Order {o.name}</strong>
                  <small>{dateFmt.format(new Date(o.processedAt))}</small>
                </div>
                <span className={`status ${o.financialStatus === 'PAID' ? '' : 'status--processing'}`}>
                  {STATUS_LABEL[o.financialStatus] || o.financialStatus}
                </span>
              </header>
              <ul className="order__lines">
                {o.lineItems.nodes.map((l, i) => (
                  <li key={i}>
                    {l.image ? <img src={l.image.url} alt="" loading="lazy" /> : <span />}
                    <span>{l.title}</span>
                    <span>× {l.quantity}</span>
                    <span />
                  </li>
                ))}
              </ul>
              <footer className="order__foot">
                <a href={o.statusPageUrl} className="link-btn">Track order</a>
                <span>Total <strong>{formatPrice(Number(o.totalPrice.amount))}</strong></span>
              </footer>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Account links point at Shopify directly; this only forwards direct visits to /account.
function ShopifyAccount() {
  useEffect(() => {
    window.location.replace(accountUrl)
  }, [])
  return <Loader />
}

function DemoAccount() {
  const orders = demo.orders.map((o) => {
    const lines = o.lines.map((l) => {
      const product = getProductById(l.productId)
      return { ...l, product, total: product.price * l.qty }
    })
    return { ...o, lines, total: lines.reduce((n, l) => n + l.total, 0) }
  })

  return (
    <div className="page container account">
      <div className="demo-banner" role="note">
        <strong>Demo account.</strong> Sign-in requires a Shopify customer account connection. The orders below are sample data for testing the order-history layout — they are not real customers or real orders.
      </div>
      <h1>Order history</h1>
      <ul className="orders">
        {orders.map((o) => (
          <li key={o.id} className="order">
            <header className="order__head">
              <div>
                <strong>{o.id}</strong> <span className="demo-tag">demo</span>
                <small>{dateFmt.format(new Date(o.placedAt))}</small>
              </div>
              <span className={`status status--${o.status.toLowerCase()}`}>{o.status}</span>
            </header>
            <ul className="order__lines">
              {o.lines.map((l) => (
                <li key={l.productId}>
                  <img src={l.product.images[0]} alt="" loading="lazy" />
                  <Link to={`/products/${l.product.handle}`}>{shortTitle(l.product)}</Link>
                  <span>× {l.qty}</span>
                  <span>{formatPrice(l.total)}</span>
                </li>
              ))}
            </ul>
            <footer className="order__foot">Total (excl. shipping) <strong>{formatPrice(o.total)}</strong></footer>
          </li>
        ))}
      </ul>
    </div>
  )
}
