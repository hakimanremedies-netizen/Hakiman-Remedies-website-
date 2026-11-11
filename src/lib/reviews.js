// Product reviews from Judge.me (Shopify app). Reads the public widget endpoint and
// parses its HTML, so only reviews published in Judge.me ever show on the site.
const SHOP = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
// Judge.me's public (read-only, storefront) token. Never use the private one here.
const TOKEN = import.meta.env.VITE_JUDGEME_PUBLIC_TOKEN

const text = (el, sel) => el.querySelector(sel)?.textContent.trim() || ''

export async function fetchReviews(handle) {
  if (!SHOP || !TOKEN) return null
  const url = `https://judge.me/api/v1/widgets/product_review?api_token=${TOKEN}&shop_domain=${SHOP}&handle=${encodeURIComponent(handle)}`
  const res = await fetch(url)
  if (!res.ok) return null
  const { widget } = await res.json()
  if (!widget) return null
  const doc = new DOMParser().parseFromString(widget, 'text/html')
  const root = doc.querySelector('.jdgm-rev-widg')
  const count = Number(root?.dataset.numberOfReviews) || 0
  const average = Number(root?.dataset.averageRating) || 0
  const reviews = [...doc.querySelectorAll('.jdgm-rev')].map((el) => ({
    id: el.dataset.reviewId || text(el, '.jdgm-rev__title') + text(el, '.jdgm-rev__author'),
    rating: Number(el.querySelector('.jdgm-rev__rating')?.dataset.score) || 0,
    head: text(el, '.jdgm-rev__title'),
    body: text(el, '.jdgm-rev__body'),
    who: text(el, '.jdgm-rev__author'),
    verified: el.dataset.verifiedBuyer === 'true',
  })).filter((r) => r.rating && (r.head || r.body))
  return { count, average, reviews }
}

// Sends a review to Judge.me's public review form (no token). Judge.me holds it for
// moderation, so it only shows on the site once it is published there.
export async function submitReview(shopifyId, { name, email, rating, title, body }) {
  if (!SHOP || !shopifyId) throw new Error('Reviews are not available right now.')
  // Form-encoded so the browser sends it without a CORS preflight (Judge.me has none).
  const form = new URLSearchParams({
    shop_domain: SHOP,
    platform: 'shopify',
    id: String(shopifyId).split('/').pop(),
    name,
    email,
    rating: String(rating),
    title,
    body,
  })
  const res = await fetch('https://judge.me/api/v1/reviews', { method: 'POST', body: form })
  if (!res.ok) {
    const { message } = await res.json().catch(() => ({}))
    throw new Error(message || 'Could not send your review. Please try again.')
  }
}
