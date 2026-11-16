import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { renderShopifyScriptTags } from '@shopify/hydrogen'
import { handleShopifyRequest, isShopifyPath } from './server/shopify.js'
import { SHOPIFY_ANALYTICS, SHOPIFY_CONSENT, SHOPIFY_I18N } from './src/lib/shopifyScripts.js'

// Shopify's storefront scripts (analytics, cookie consent, cart actions) in <head>.
// They need the shop's ID, which is read once from the Storefront API here.
async function shopifyScriptTags(env) {
  const domain = env.VITE_SHOPIFY_STORE_DOMAIN
  const token = env.VITE_SHOPIFY_STOREFRONT_TOKEN
  if (!domain || !token) return []
  try {
    const res = await fetch(`https://${domain}/api/2026-07/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': token },
      body: JSON.stringify({ query: '{ shop { id } }' }),
    })
    const shopId = (await res.json())?.data?.shop?.id
    if (!shopId) throw new Error(`no shop id (HTTP ${res.status})`)
    return renderShopifyScriptTags({
      shop: { shopId, storefrontId: env.VITE_SHOPIFY_STOREFRONT_ID || '0', myshopifyDomain: domain },
      analytics: SHOPIFY_ANALYTICS,
      consent: SHOPIFY_CONSENT,
      i18n: SHOPIFY_I18N,
    })
  } catch (err) {
    // Loud, because without these tags Shopify Analytics and the Shopify cart are off.
    console.warn(`\n⚠ Shopify scripts NOT added: ${err.message}. Shopify Analytics and the Shopify cart are disabled in this build.\n`)
    return []
  }
}

// Node request -> Fetch Request, for the Shopify routes in the dev server.
async function toFetchRequest(req) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x))
    else if (v != null) headers.set(k, v)
  }
  let body
  if (!['GET', 'HEAD'].includes(req.method)) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    body = Buffer.concat(chunks)
  }
  return new Request(new URL(req.originalUrl || req.url, `http://${req.headers.host}`), { method: req.method, headers, body })
}

// Local stand-in for api/shopify.js, so /api/*, /checkout etc. work in `npm run dev`
// and `npm run preview`.
function shopifyMiddleware(env) {
  return async (req, res, next) => {
    const { pathname } = new URL(req.originalUrl || req.url, 'http://localhost')
    if (!isShopifyPath(pathname)) return next()
    try {
      const response = await handleShopifyRequest(await toFetchRequest(req), env)
      if (!response) return next()
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        // fetch() already decoded the body; set-cookie is copied below, one header per cookie.
        if (!['content-encoding', 'content-length', 'set-cookie'].includes(key)) res.setHeader(key, value)
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) res.setHeader('set-cookie', cookies)
      res.end(Buffer.from(await response.arrayBuffer()))
    } catch (err) {
      next(err)
    }
  }
}

function shopifyStorefront(env) {
  let tags
  return {
    name: 'hakiman-shopify-storefront',
    configureServer(server) {
      server.middlewares.use(shopifyMiddleware(env))
    },
    configurePreviewServer(server) {
      server.middlewares.use(shopifyMiddleware(env))
    },
    async transformIndexHtml(html) {
      tags ??= shopifyScriptTags(env)
      const list = await tags
      return list.length ? html.replace('</head>', `    ${list.join('\n    ')}\n  </head>`) : html
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), shopifyStorefront(env)],
    server: { port: 4800, strictPort: true },
    preview: { port: 4800 },
  }
})
