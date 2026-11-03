// Shopify Customer Account API: in-site sign-in via OAuth 2.0 + PKCE (public client).
// Shopify hosts only the email + one-time-code step; the account page itself is ours.
// Needs VITE_SHOPIFY_CUSTOMER_CLIENT_ID (Headless channel → Customer Account API).
const DOMAIN = import.meta.env.VITE_SHOPIFY_STORE_DOMAIN
const CLIENT_ID = import.meta.env.VITE_SHOPIFY_CUSTOMER_CLIENT_ID

export const customerAccountsEnabled = Boolean(DOMAIN && CLIENT_ID)

const TOKENS_KEY = 'hakiman-customer-tokens'
const PENDING_KEY = 'hakiman-customer-login'
const callbackUrl = () => `${window.location.origin}/account/callback`

let discovery = null
async function discover() {
  if (discovery) return discovery
  const [openid, api] = await Promise.all([
    fetch(`https://${DOMAIN}/.well-known/openid-configuration`).then((r) => r.json()),
    fetch(`https://${DOMAIN}/.well-known/customer-account-api`).then((r) => r.json()),
  ])
  discovery = { ...openid, graphqlApi: api.graphql_api }
  return discovery
}

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const randomString = () => base64url(crypto.getRandomValues(new Uint8Array(32)))
const sha256 = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || null
  } catch {
    return null
  }
}

function saveTokens(t) {
  const tokens = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    idToken: t.id_token ?? readTokens()?.idToken,
    // Refresh a minute early so a request never goes out with a just-expired token.
    expiresAt: Date.now() + (t.expires_in - 60) * 1000,
  }
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  return tokens
}

export const isSignedIn = () => Boolean(readTokens())

export async function signIn(returnTo = '/account') {
  const { authorization_endpoint } = await discover()
  const verifier = randomString()
  const state = randomString()
  const nonce = randomString()
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, returnTo }))
  const url = new URL(authorization_endpoint)
  url.search = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: callbackUrl(),
    scope: 'openid email customer-account-api:full',
    state,
    nonce,
    code_challenge: base64url(await sha256(verifier)),
    code_challenge_method: 'S256',
  })
  window.location.assign(url)
}

// Completes sign-in on /account/callback; returns the path to continue to.
export async function finishSignIn(params) {
  const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')
  sessionStorage.removeItem(PENDING_KEY)
  if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'))
  if (!pending || params.get('state') !== pending.state) throw new Error('Sign-in session expired. Please try again.')
  const { token_endpoint } = await discover()
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: callbackUrl(),
      code: params.get('code'),
      code_verifier: pending.verifier,
    }),
  })
  if (!res.ok) throw new Error(`Sign-in failed (${res.status})`)
  saveTokens(await res.json())
  return pending.returnTo
}

async function accessToken() {
  const tokens = readTokens()
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt) return tokens.accessToken
  const { token_endpoint } = await discover()
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, refresh_token: tokens.refreshToken }),
  })
  if (!res.ok) {
    localStorage.removeItem(TOKENS_KEY)
    return null
  }
  return saveTokens(await res.json()).accessToken
}

export async function signOut() {
  const tokens = readTokens()
  localStorage.removeItem(TOKENS_KEY)
  const { end_session_endpoint } = await discover()
  if (!tokens?.idToken || !end_session_endpoint) return window.location.assign('/')
  const url = new URL(end_session_endpoint)
  url.search = new URLSearchParams({ id_token_hint: tokens.idToken, post_logout_redirect_uri: window.location.origin })
  window.location.assign(url)
}

const CUSTOMER_QUERY = `
  query Customer {
    customer {
      firstName lastName
      emailAddress { emailAddress }
      defaultAddress { formatted }
      orders(first: 25, sortKey: PROCESSED_AT, reverse: true) {
        nodes {
          id name processedAt financialStatus statusPageUrl
          totalPrice { amount }
          lineItems(first: 20) { nodes { title quantity image { url } } }
        }
      }
    }
  }`

// Returns null when signed out (or the session could not be refreshed).
export async function fetchCustomer() {
  const token = await accessToken()
  if (!token) return null
  const { graphqlApi } = await discover()
  const res = await fetch(graphqlApi, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query: CUSTOMER_QUERY }),
  })
  if (res.status === 401) {
    localStorage.removeItem(TOKENS_KEY)
    return null
  }
  const { data, errors } = await res.json()
  if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
  return data.customer
}
