// Shopify Storefront API client. Active only when both env vars are set
// (see .env.example); otherwise the site runs on the local JSON snapshot.
const DOMAIN = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
const TOKEN = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
const API_VERSION = '2026-07'

export const shopifyEnabled = Boolean(DOMAIN && TOKEN)

async function storefront(query, variables = {}) {
  const res = await fetch(`https://${DOMAIN}/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Shopify Storefront API ${res.status}`)
  const { data, errors } = await res.json()
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
  return data
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title productType vendor description availableForSale
        images(first: 20) { nodes { url altText } }
        variants(first: 50) {
          nodes {
            id title sku availableForSale
            price { amount currencyCode }
            compareAtPrice { amount }
          }
        }
      }
    }
  }`

export async function fetchShopifyProducts() {
  const all = []
  let cursor = null
  do {
    const { products } = await storefront(PRODUCTS_QUERY, { cursor })
    all.push(...products.nodes)
    cursor = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null
  } while (cursor)
  return all
}

const CART_CREATE = `
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart { checkoutUrl }
      userErrors { message }
    }
  }`

// Creates a Shopify cart from local cart lines and returns the hosted checkout URL.
export async function createCheckoutUrl(lines) {
  const { cartCreate } = await storefront(CART_CREATE, {
    lines: lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.qty })),
  })
  if (cartCreate.userErrors.length) throw new Error(cartCreate.userErrors.map((e) => e.message).join('; '))
  return cartCreate.cart.checkoutUrl
}
