// Writes public/sitemap.xml and public/robots.txt before each build, from the
// site's routes, product handles and policy pages. Runs as part of `npm run build`.
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const SITE = 'https://www.thehakiman.com'
const ROOT = path.resolve(import.meta.dirname, '..')
const read = async (f) => JSON.parse(await readFile(path.join(ROOT, f), 'utf8'))

const products = await read('src/data/products.json')
const policies = await read('src/data/policies.json')

const urls = [
  '/',
  '/shop',
  ...products.map((p) => `/products/${p.handle.replace(/^-+|-+$/g, '')}`),
  '/our-story',
  '/ingredients',
  '/learn',
  '/contact',
  ...Object.keys(policies).map((k) => `/policies/${k}`),
]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}
</urlset>
`
await writeFile(path.join(ROOT, 'public/sitemap.xml'), xml)
await writeFile(
  path.join(ROOT, 'public/robots.txt'),
  `User-agent: *\nDisallow: /checkout\nDisallow: /cart\nDisallow: /account\nDisallow: /api/\nDisallow: /__shopify/\n\nSitemap: ${SITE}/sitemap.xml\n`,
)
console.log(`sitemap: ${urls.length} URLs`)
