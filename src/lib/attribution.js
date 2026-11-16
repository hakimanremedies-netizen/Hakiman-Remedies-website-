// Where this visit came from (UTM tags, ad click ids, referrer, landing page),
// captured on the first page of the visit and saved onto the Shopify cart as
// hidden attributes (leading "_"), so every order shows its source in Shopify admin.
const KEY = 'hakiman-attribution'
const PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid']

function read() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY)) || null
  } catch {
    return null
  }
}

// Call once at startup. Keeps the first touch of the visit; a new campaign link
// within the same visit replaces it.
export function captureAttribution() {
  const url = new URL(window.location.href)
  const tagged = PARAMS.some((p) => url.searchParams.has(p))
  if (read() && !tagged) return
  const data = { landing_page: url.pathname + url.search }
  for (const p of PARAMS) if (url.searchParams.has(p)) data[p] = url.searchParams.get(p).slice(0, 255)
  const ref = document.referrer
  if (ref && !ref.startsWith(window.location.origin)) data.referrer = ref.slice(0, 255)
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // storage blocked: attribution is best-effort
  }
}

// [{ key: '_utm_source', value: 'instagram' }, ...]
export function attributionAttributes() {
  const data = read()
  return data ? Object.entries(data).map(([k, value]) => ({ key: `_${k}`, value })) : []
}
