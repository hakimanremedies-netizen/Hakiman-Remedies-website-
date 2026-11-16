// Shopify routes served from our own domain, shared by the Vercel function
// (api/shopify.js) and the Vite dev server (vite.config.js).
//
// They make thehakiman.com behave like a Shopify storefront for Shopify's scripts:
// - /api/{version}/graphql.json  Storefront API proxy. Shopify sets its analytics
//                                and session cookies through it, on our domain.
// - /api/cart                    the cart, kept in Shopify and found by a cart cookie
// - /checkout                    sends the shopper to that cart's Shopify checkout
// - /__shopify/*, /cart/*, /.well-known/*  Shopify's own script endpoints
//
// Uses only public values: the store domain and the public Storefront token.
import {
  createCartServerHandlers,
  createShopifyRequestContext,
  createStorefrontClient,
  defineShopifyI18n,
  handleShopifyRoutes,
} from '@shopify/hydrogen'

const i18n = defineShopifyI18n({ defaultLocale: { language: 'EN', country: 'IN' } })
const cartHandlers = createCartServerHandlers()

// Paths that belong to Shopify; everything else is the React app.
export const SHOPIFY_PATH = /^\/(?:api\/|__shopify(?:\/|$)|checkout$|cart\/.|cart\.js(?:on)?$|\.well-known\/(?:ucp$|shopify\/))/

export function isShopifyPath(pathname) {
  return SHOPIFY_PATH.test(pathname)
}

// Returns a Response for a Shopify path, or null when Shopify doesn't own it
// (or the store isn't configured).
export function handleShopifyRequest(request, env) {
  const storeDomain = env.VITE_SHOPIFY_STORE_DOMAIN
  if (!storeDomain) return null
  const requestContext = createShopifyRequestContext({ request, i18n })
  const storefrontClient = createStorefrontClient({
    type: 'public',
    requestContext,
    config: { storeDomain, publicStorefrontToken: env.VITE_SHOPIFY_STOREFRONT_TOKEN },
  })
  return handleShopifyRoutes({ request, requestContext, storefrontClient, handlers: [cartHandlers] })
}
