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
