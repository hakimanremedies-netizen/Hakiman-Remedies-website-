import { useEffect } from 'react'
import { summary } from './catalog'

const SITE = 'https://www.thehakiman.com'
const DEFAULT_TITLE = 'The Hakiman — Ayurvedic & Unani Remedies'

function setMeta(selector, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(attrs.rel ? 'link' : 'meta')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

// Title, description, canonical URL and Product structured data for a product page.
// Shopify's product SEO fields (Search engine listing) win over the defaults.
// `rating` ({ average, count }) comes from published Judge.me reviews.
export function useProductSeo(product, name, rating) {
  useEffect(() => {
    const url = `${SITE}/products/${product.handle}`
    const description = product.seo?.description || summary(product)
    const metaDesc = document.head.querySelector('meta[name="description"]')
    const prevDesc = metaDesc?.getAttribute('content')

    document.title = product.seo?.title || `${name} | The Hakiman`
    setMeta('meta[name="description"]', { name: 'description', content: description })
    const canonical = setMeta('link[rel="canonical"]', { rel: 'canonical', href: url })

    const ld = document.createElement('script')
    ld.type = 'application/ld+json'
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.title,
      description,
      image: product.images.map((src) => new URL(src, SITE).href),
      sku: product.sku,
      brand: { '@type': 'Brand', name: product.brand || 'Hakiman' },
      aggregateRating: rating?.count
        ? { '@type': 'AggregateRating', ratingValue: rating.average.toFixed(1), reviewCount: rating.count }
        : undefined,
      offers: product.variants.map((v) => ({
        '@type': 'Offer',
        url,
        sku: v.sku,
        name: product.variants.length > 1 ? v.title : undefined,
        price: v.price.toFixed(2),
        priceCurrency: 'INR',
        availability: v.available === false ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
      })),
    })
    document.head.appendChild(ld)

    return () => {
      document.title = DEFAULT_TITLE
      if (prevDesc) metaDesc.setAttribute('content', prevDesc)
      canonical.remove()
      ld.remove()
    }
  }, [product, name, rating?.average, rating?.count])
}
