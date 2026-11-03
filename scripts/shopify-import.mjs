// Creates or updates the catalog in Shopify from src/data/products.json via the Admin API.
// Safe to re-run: products are upserted by handle. Images are re-uploaded each run.
//
//   npm run shopify:import              # import everything
//   npm run shopify:import -- --dry-run # print what would be sent, no API calls
//
// Needs in .env.local: VITE_SHOPIFY_STORE_DOMAIN, plus SHOPIFY_ADMIN_TOKEN or
// SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET. Admin scopes: write_products,
// read_publications, write_publications.
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const API_VERSION = '2026-07'
const ROOT = path.resolve(import.meta.dirname, '..')
const DRY_RUN = process.argv.includes('--dry-run')
const DOMAIN = process.env.VITE_SHOPIFY_STORE_DOMAIN

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

// Retries network failures (seen intermittently on long image uploads).
async function fetchRetry(url, opts, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      return await fetchRetry(url, opts)
    } catch (err) {
      if (i >= tries) throw err
      console.warn(`  network error, retrying (${i}/${tries - 1})…`)
      await new Promise((r) => setTimeout(r, 1000 * i))
    }
  }
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function descriptionHtml(p) {
  const paras = p.description.map((t) => `<p>${escapeHtml(t)}</p>`)
  const list = p.features.length ? [`<ul>${p.features.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}</ul>`] : []
  return [...paras, ...list].join('\n')
}

async function getAdminToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN
  const { SHOPIFY_CLIENT_ID: id, SHOPIFY_CLIENT_SECRET: secret } = process.env
  if (!id || !secret) throw new Error('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET, in .env.local')
  const res = await fetchRetry(`https://${DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  return (await res.json()).access_token
}

let token
async function admin(query, variables = {}) {
  const res = await fetchRetry(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Admin API ${res.status}: ${await res.text()}`)
  const { data, errors } = await res.json()
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
  return data
}

function assertNoUserErrors(result, label) {
  if (result.userErrors?.length) {
    throw new Error(`${label}: ${result.userErrors.map((e) => `${e.field?.join('.') ?? ''} ${e.message}`).join('; ')}`)
  }
}

// Uploads a local image to Shopify's staging bucket and returns a URL productSet can attach.
async function stageImage(publicPath) {
  const file = path.join(ROOT, 'public', publicPath)
  const filename = path.basename(file)
  const mimeType = MIME[path.extname(file).toLowerCase()]
  const { size } = await stat(file)
  const { stagedUploadsCreate: r } = await admin(
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    { input: [{ resource: 'IMAGE', filename, mimeType, httpMethod: 'POST', fileSize: String(size) }] },
  )
  assertNoUserErrors(r, `stage ${filename}`)
  const target = r.stagedTargets[0]
  const form = new FormData()
  for (const { name, value } of target.parameters) form.append(name, value)
  form.append('file', new Blob([await readFile(file)], { type: mimeType }), filename)
  const up = await fetchRetry(target.url, { method: 'POST', body: form })
  if (!up.ok) throw new Error(`Upload ${filename} failed: ${up.status}`)
  return target.resourceUrl
}

// Shopify trims leading/trailing dashes; send the trimmed form so re-runs upsert instead of duplicating.
const shopifyHandle = (h) => h.replace(/^-+|-+$/g, '')

async function productInput(p) {
  const v = p.variants[0]
  return {
    handle: shopifyHandle(p.handle),
    title: p.title,
    descriptionHtml: descriptionHtml(p),
    productType: p.category,
    vendor: p.brand,
    status: 'ACTIVE',
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [
      {
        optionValues: [{ optionName: 'Title', name: 'Default Title' }],
        price: String(v.price),
        compareAtPrice: v.compareAtPrice ? String(v.compareAtPrice) : null,
        // Stock is not tracked until real inventory is entered in Shopify admin.
        inventoryItem: { sku: v.sku, tracked: false },
      },
    ],
    files: DRY_RUN
      ? p.images.map((src) => ({ originalSource: src, contentType: 'IMAGE', alt: p.title }))
      : await Promise.all(
          p.images.map(async (src) => ({ originalSource: await stageImage(src), contentType: 'IMAGE', alt: p.title })),
        ),
  }
}

async function main() {
  const products = JSON.parse(await readFile(path.join(ROOT, 'src/data/products.json'), 'utf8'))

  if (DRY_RUN) {
    for (const p of products) console.log(JSON.stringify(await productInput(p), null, 2))
    return
  }
  if (!DOMAIN) throw new Error('Set VITE_SHOPIFY_STORE_DOMAIN in .env.local')
  token = await getAdminToken()

  const { publications } = await admin(`{ publications(first: 20) { nodes { id name } } }`)
  console.log(`Publishing to: ${publications.nodes.map((n) => n.name).join(', ')}`)

  for (const p of products) {
    const { productSet: r } = await admin(
      `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(input: $input, identifier: $identifier, synchronous: true) {
          product { id handle }
          userErrors { field message }
        }
      }`,
      { input: await productInput(p), identifier: { handle: shopifyHandle(p.handle) } },
    )
    assertNoUserErrors(r, p.handle)

    const { publishablePublish: pub } = await admin(
      `mutation($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) { userErrors { field message } }
      }`,
      { id: r.product.id, input: publications.nodes.map((n) => ({ publicationId: n.id })) },
    )
    assertNoUserErrors(pub, `publish ${p.handle}`)
    console.log(`✓ ${p.title}`)
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
