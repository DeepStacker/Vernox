# Try Vernox on your computer

Everything runs locally: the shop, the design studio, every staff console and the API, with sample products, a login for
each role and orders at every stage. Nothing connects to the real store, and no accounts or keys are needed.

## 1. Install once

- **Node.js 22 or newer**: https://nodejs.org (LTS).
- **Java 21 or newer** (the local database needs it): https://adoptium.net.
- **Git**: https://git-scm.com.

Check them with `node -v`, `java -version` and `git --version`.

## 2. Start

```bash
git clone https://github.com/DeepStacker/Vernox.git
cd Vernox
npm install
npm run demo
```

The first start takes a few minutes (it downloads the local database once and creates the demo data). When it prints
**"Vernox is running"**, open http://localhost:8080.

Stop with **Ctrl+C**; your changes are kept. Next time just run `npm run demo`. To start over with fresh demo data:
`npm run demo -- --reset`.

## 3. Log in

Every login uses the password **`VernoxDemo#2026`** (the list is also printed when the demo starts, and lives in
`scripts/demo/accounts.json`).

| Login | Role | Open | Try |
|---|---|---|---|
| `customer@demo.vernox.test` | Customer | http://localhost:8080/account | Orders, tracking, cancel, return, wishlist |
| `owner@demo.vernox.test` | Owner (super admin) | http://localhost:8080/admin | Everything: launch checklist, team, settings, integrations |
| `admin@demo.vernox.test` | Admin | /admin | All operations except team and integrations |
| `catalog@demo.vernox.test` | Catalogue manager | /admin → Products | Products, photos, prices, reviews |
| `orders@demo.vernox.test` | Order manager | /admin → Orders, New order | Confirm COD orders, staff orders, returns |
| `production@demo.vernox.test` | Workshop | /admin → Production, QC and packing | Move orders through the workshop, QC checklist |
| `shipping@demo.vernox.test` | Shipping | /admin → Shipping | Book the packed order (manual courier), mark delivered |
| `finance@demo.vernox.test` | Finance | /admin → Finance | Payments, invoices (specimen), refunds, CSV exports |
| `support@demo.vernox.test` | Support | /admin → Support, Trade enquiries | The demo ticket and trade enquiry, order lookup |
| `designer@demo.vernox.test` | Designer | /admin → Consultations | Design consultations (switch them on in Settings first) |

Staff sign in at `/admin`; customers at `/account`. A new customer account can also be created on the sign-in page.

## 4. What to try

- **Shop**: browse, filter, open a product, change size and finish, add 10+ pieces to see the bulk discount, check out
  with **Cash on delivery** (online payment needs Razorpay test keys, see below). Track it at /track-order.
- **Studio** (/studio): start from a template, add text (try "Follow arc"), elements, a jali pattern, draw with the pen,
  see the price breakdown, add to cart. **Batch** in the Studio header orders many personalised plates from a CSV.
- **Corporate & bulk** (/trade): volume pricing and the enquiry form.
- **Staff**: the demo has six orders, one at each stage (new, in design, cutting, quality check, packed, delivered).
  Log in as each role above and move them along; the screens only show what that role may do.

## Good to know

- Emails, SMS and WhatsApp messages are queued, not sent, and invoices are **specimens**: the business details and keys
  are placeholders until the owner fills them in (owner login → Settings → Launch setup / Integrations).
- Online payment: add Razorpay **test** keys in Settings → Integrations (owner login) to try UPI and cards.
- Port already in use? Stop the other program on ports 8080, 8085, 9099 or 9199, or close an earlier `npm run demo`.
- Something odd after an update? `npm install` then `npm run demo -- --reset`.

Running the real shop on a server is a different path: see `DEPLOYMENT.md` (`./install.sh`).
