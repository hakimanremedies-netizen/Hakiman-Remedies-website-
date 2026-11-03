# The Hakiman — storefront redesign (prototype)

Vite + React + GSAP prototype at `http://localhost:4800`.

```
npm install
npm run dev
```

## Source of truth

Everything comes from **https://thehakiman.com/** (a custom PHP site, not Shopify). It was snapshotted on 2026-10-20.

- `source-snapshot/html/`: raw HTML of every page that was scraped
- `public/assets/`: original logos, product images, galleries, banners and reels, downloaded byte-for-byte. The logos were checked by SHA-256 against the live site.
- `scripts/import-catalog.py` → `src/data/products.json` (run with `npm run import:catalog`)
- `scripts/import-policies.py` → `src/data/policies.json` (run with `npm run import:policies`)
- `src/data/brand.js`: about and contact copy, quoted word for word

## Catalog (8 products, verified against the source pages)

| Product | Category | Price | MRP |
|---|---|---|---|
| Haldi Chandan Hand Made Soap | Soap | ₹216 | ₹240 |
| Cystorita Syrup | Syrup | ₹207 | ₹230 |
| Neem Hand Made Soap | Soap | ₹196 | ₹218 |
| De-Tan Hand Made Soap | Soap | ₹257 | ₹285 |
| Fizoliv DS Syrup | Syrup | ₹213 | ₹237 |
| Cystorita Ayurvedic Women’s Health Capsules | Tablet | ₹360 | ₹450 |
| PASHOYA Pain Salt – Joint Support & Natural Body Detox Salt | Powder | ₹522 | ₹695 |
| Piloman Advanced Ayurvedic Piles Care Capsules | Tablet | ₹360 | ₹450 |

### Missing on the source (left empty, not invented)
- **Ingredients**: published only for PASHOYA. The soap and Cystorita Syrup descriptions name some herbs, which are used on the Ingredients page as quotes. Piloman, Cystorita Capsules and Fizoliv DS have no ingredient list.
- **Usage instructions**: published only for PASHOYA.
- **Precautions, FAQs, reviews**: none on any product. The site FAQ page is empty and every product has 0 reviews.
- **Variants**: each product has a single default option.
- **Journal**: the source blog has no entries.
- **Social links**: the footer icons on the source are `href="#"`, so they were left out.

## Needs brand confirmation before launch
1. **Founding year conflict**: the logo says *Since 1943*, the site copy says *Since 1953*, and the Neem and Haldi Chandan soap boxes say *Since 1913*. None of these were changed. The new design puts no year in any headline.
2. **Typo on the source**: the Cystorita Syrup description begins “ystorita Syrup…” (missing the C). It is kept as published.
3. **Duplicated SKU prefix**: the De-Tan SKU is stored on the source as “SKU: HAK-DT-001”. The prefix is hidden in the UI.
4. **Source category pages**: the source shows PASHOYA under every category, which is a source bug. The prototype uses each product's own Category field.
5. **Unverified trust badges**: “100% Toxin-Free / Lab-Tested / 24/7 Support / Sustainable” appear on the source with no documentation, so they were not reused. “24/7 Support” also conflicts with the published Sat–Sun consultation hours.
6. **Journal drafts**: `src/data/journal.js` has outline topics only. They can be previewed at `/learn?preview=drafts`.

## Demo vs real
- Demo only (clearly labelled): stock levels (`src/data/demo/inventory.json`), sample orders (`src/data/demo/orders.json`, shown at `/account`), the cart (stored in localStorage) and the checkout page.
- Checkout collects no payment details and never claims an order was placed. “Continue to secure checkout” stays disabled until Shopify is connected.
- “Send order on WhatsApp” and the Contact form open WhatsApp with a prefilled message to the **real** Hakiman number. Nothing is sent until the user presses send.

## Shopify
The site runs on the JSON snapshot until `.env.local` has the Shopify keys (see `.env.example`). Then:

- `src/lib/shopify.js` loads products from the Storefront API before the first render. Price, variants and availability come from Shopify. Editorial content (highlights, features, ingredients, design images) still comes from `products.json`, matched by handle.
- The cart stays local. "Continue to secure checkout" creates a Shopify cart and redirects to its hosted `checkoutUrl`.
- `npm run shopify:import` creates or updates the 8 products in Shopify via the Admin API (`-- --dry-run` to preview). Inventory is set to untracked; enter real stock in Shopify admin.
- On Vercel, add `VITE_SHOPIFY_STORE_DOMAIN` and `VITE_SHOPIFY_STOREFRONT_TOKEN` as environment variables. Never add the Admin keys there.

Still to do: customer accounts (`/account` is demo), and moving editorial content to metafields.
