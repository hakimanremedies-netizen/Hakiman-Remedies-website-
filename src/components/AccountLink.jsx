import { Link } from 'react-router-dom'
import { accountUrl, shopifyEnabled } from '../lib/shopify'

// With Shopify connected, account links go straight to Shopify's customer accounts
// (sign-in, orders, addresses); otherwise to the demo /account page.
export default function AccountLink(props) {
  return shopifyEnabled ? <a href={accountUrl} {...props} /> : <Link to="/account" {...props} />
}
