// Settings for Shopify's storefront scripts, shared by vite.config.js (which writes
// the script tags into index.html at build time) and the browser (which starts them).
// Plain constants only: this file is also imported by Node.

// Shopify's own cookie banner. It appears only where Shopify's Customer privacy
// settings require it for the visitor's region; elsewhere tracking starts right away.
export const SHOPIFY_CONSENT = { mode: 'default-banner' }

export const SHOPIFY_I18N = { language: 'EN', country: 'IN', currency: 'INR' }

// Reported to Shopify as the Headless sales channel.
export const SHOPIFY_ANALYTICS = { channel: 'headless' }
