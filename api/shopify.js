// Vercel Function behind the Shopify paths listed in vercel.json (see server/shopify.js).
import { handleShopifyRequest } from '../server/shopify.js'

export default {
  async fetch(request) {
    // vercel.json passes the original path as ?__p= because the rewrite lands here.
    const url = new URL(request.url)
    const original = url.searchParams.get('__p')
    if (original) {
      url.searchParams.delete('__p')
      url.pathname = original
    }
    const hasBody = !['GET', 'HEAD'].includes(request.method)
    const shopifyRequest = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: request.signal,
    })
    const response = handleShopifyRequest(shopifyRequest, process.env)
    return response ? await response : new Response('Not found', { status: 404 })
  },
}
