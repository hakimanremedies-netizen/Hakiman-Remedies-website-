// Shopify Storefront API client. Active only when both env vars are set
// (see .env.example); otherwise the site runs on the local JSON snapshot.
const DOMAIN = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
const TOKEN = import.meta.env.VITE_SHOPIFY_STOREFRONT_TOKEN
const API_VERSION = '2026-07'

export const shopifyEnabled = Boolean(DOMAIN && TOKEN)

// Shopify-hosted customer accounts (email one-time-code sign-in, orders, addresses).
export const accountUrl = `https://${DOMAIN}/account`

// Requests go through our same-origin Storefront API proxy (api/shopify.js), so Shopify
// sets its analytics and session cookies on thehakiman.com. Where the proxy isn't
// running (e.g. `vite preview`), it falls back to calling Shopify directly.
const PATH = `/api/${API_VERSION}/graphql.json`
let useProxy = true

function post(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN },
    body,
  })
}

const isJson = (res) => Boolean(res?.headers.get('content-type')?.includes('json'))

async function storefront(query, variables = {}, { allowDenied = false } = {}) {
  const body = JSON.stringify({ query, variables })
  let res = useProxy ? await post(PATH, body).catch(() => null) : null
  if (!res?.ok || !isJson(res)) {
    // An HTML answer means there is no proxy here at all; a failed one may be transient.
    if (res && !isJson(res)) useProxy = false
    res = await post(`https://${DOMAIN}${PATH}`, body)
  }
  if (!res.ok) throw new Error(`Shopify Storefront API ${res.status}`)
  const { data, errors } = await res.json()
  // ACCESS_DENIED only nulls the denied field; the rest of the data is still usable.
  const fatal = errors?.filter((e) => !(allowDenied && e.extensions?.code === 'ACCESS_DENIED'))
  if (fatal?.length) throw new Error(fatal.map((e) => e.message).join('; '))
  return data
}

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id handle title productType vendor description availableForSale
        seo { title description }
        saleEndsAt: metafield(namespace: "custom", key: "sale_ends_at") { value }
        images(first: 20) { nodes { url altText } }
        variants(first: 50) {
          nodes {
            id title sku availableForSale
            quantityAvailable currentlyNotInStock
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
    // quantityAvailable needs the storefront's unauthenticated_read_product_inventory permission;
    // without it stock counts come back null and only in/out of stock is shown.
    const { products } = await storefront(PRODUCTS_QUERY, { cursor }, { allowDenied: true })
    all.push(...products.nodes)
    cursor = products.pageInfo.hasNextPage ? products.pageInfo.endCursor : null
  } while (cursor)
  return all
}

// Store-wide settings kept as shop metafields (Settings → Custom data → Shop), e.g.
// custom.free_shipping_threshold = 499. Missing values switch the related UI off.
const SHOP_QUERY = `
  query Shop {
    shop {
      freeShippingThreshold: metafield(namespace: "custom", key: "free_shipping_threshold") { value }
    }
  }`

export async function fetchShopSettings() {
  const { shop } = await storefront(SHOP_QUERY)
  const threshold = Number(shop.freeShippingThreshold?.value)
  return { freeShippingThreshold: threshold > 0 ? threshold : null }
}

// "Frequently bought together" as configured in Shopify's Search & Discovery app.
const COMPLEMENTARY_QUERY = `
  query Complementary($id: ID!) {
    productRecommendations(productId: $id, intent: COMPLEMENTARY) { handle }
  }`

export async function fetchComplementaryHandles(productId) {
  const { productRecommendations } = await storefront(COMPLEMENTARY_QUERY, { id: productId })
  return (productRecommendations ?? []).map((p) => p.handle)
}

const CART_CREATE = `
  mutation CartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        checkoutUrl
        discountCodes { code applicable }
        cost { subtotalAmount { amount } }
      }
      userErrors { message }
    }
  }`

// Creates a Shopify cart from local cart lines. Automatic discounts are applied by
// Shopify; a typed code is checked here so the shopper hears about a bad code before
// leaving the site.
export async function createCart(lines, discountCode) {
  const { cartCreate } = await storefront(CART_CREATE, {
    input: {
      lines: lines.map((l) => ({ merchandiseId: l.variantId, quantity: l.qty })),
      discountCodes: discountCode ? [discountCode] : [],
    },
  })
  if (cartCreate.userErrors.length) throw new Error(cartCreate.userErrors.map((e) => e.message).join('; '))
  const { cart } = cartCreate
  return {
    checkoutUrl: cart.checkoutUrl,
    codeApplicable: discountCode ? cart.discountCodes.some((d) => d.applicable) : null,
    subtotal: Number(cart.cost.subtotalAmount.amount),
  }
}
