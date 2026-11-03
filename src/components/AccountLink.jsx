import { Link } from 'react-router-dom'
import { accountUrl, shopifyEnabled } from '../lib/shopify'
import { customerAccountsEnabled } from '../lib/customer'

// In-site account page once the Customer Account API is set up; until then Shopify's
// hosted account pages when connected, or the demo /account page.
export default function AccountLink(props) {
  return shopifyEnabled && !customerAccountsEnabled ? <a href={accountUrl} {...props} /> : <Link to="/account" {...props} />
}
