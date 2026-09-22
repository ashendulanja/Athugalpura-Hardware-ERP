# Hardware ERP — Web Trial Build

A polished browser-based hardware retail ERP starter for GitHub Pages + Supabase.

## Included in this build

- Responsive animated Super Admin / Shop Admin UI
- Multi-shop / tenant workspace model
- Dashboard with sales, GP, inventory value, receivables and action center
- Product master: SKU, barcode, category, brand, multi-UOM fields, pricing, minimum price, reorder, warehouse/rack, serial/batch flags
- POS: search / barcode-ready workflow, cart, customer, payment type, stock movement posting, credit outstanding
- Inventory: stock position, reserved quantity, stock ledger, controlled adjustments and stock-count workflow entry point
- Purchasing: PO board and PO creation scaffold; GRN workflow entry point
- Customers: credit limits, credit days, price groups and outstanding
- Suppliers: terms, payables and purchasing relationships
- Delivery dispatch board
- Warranty / serial claims board
- Finance: receivables, payables and expenses
- Management reports and stock category analysis
- Bulk Data Center:
  - system-generated Excel `.xlsx` templates
  - direct Excel copy/paste
  - `.xlsx/.xls/.csv/.tsv/.txt` upload
  - automatic header mapping
  - validation and warnings
  - preview before apply
  - stock-movement/audit creation
- User Management:
  - Super Admin / Shop Admin / Manager / Cashier / Sales / Stores / Accounts / Delivery / Auditor
  - create user
  - edit role/status
  - secure temporary password reset
  - support-access audit entry
- Super Admin shop creation
- Supabase Auth + PostgreSQL schema + RLS policy foundation
- Supabase Edge Function for secure user creation / reset / profile update
- GitHub Pages deployment workflow
- PWA manifest + service-worker shell cache

---

## Demo login

**Username:** `Admin@123`  
**Password:** `Admin@123#`

`config.js` ships with `demoMode: true`, so the project can be tested immediately without Supabase.

> Important: the local demo intentionally keeps demo credentials in browser storage. Do not treat demo mode as production security.

---

# 1. Run locally first

Use a local web server; do not double-click `index.html` because service-worker/module behavior is better over HTTP.

### Python

```bash
cd hardware-erp
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

---

# 2. Put it on GitHub Pages

1. Create a new GitHub repository, for example `hardware-erp`.
2. Upload/push every file in this folder, including `.github/workflows/pages.yml`.
3. Push to the `main` branch.
4. Open GitHub repository **Settings → Pages**.
5. Under **Build and deployment**, choose **GitHub Actions**.
6. The supplied workflow deploys the repository as a static site.
7. Open the Pages URL shown by GitHub.

All web paths in the project are relative (`./...`), so it can work from a repository sub-path such as `https://USERNAME.github.io/hardware-erp/`.

---

# 3. Create the Supabase project

1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Run, in this exact order:

```text
supabase/schema.sql
supabase/bootstrap_super_admin.sql
supabase/seed_demo_data.sql        (optional but recommended for first test)
```

## Create the first Super Admin Auth user before bootstrap SQL

Open **Authentication → Users → Add user** and create/confirm:

```text
Email:    admin_123@login.hardwareerp.local
Password: Admin@123#
```

The app login field still uses:

```text
Admin@123
```

The synthetic email is only the internal Supabase Auth identity because Supabase password auth uses email/phone credentials.

Then run `bootstrap_super_admin.sql`.

---

# 4. Deploy the secure Admin Users Edge Function

The browser must NEVER contain the Supabase `service_role` / secret key. User creation and password reset therefore go through a Supabase Edge Function.

Install/login to the Supabase CLI, link the project, then from the project directory run:

```bash
supabase functions deploy admin-users
```

Make sure these Edge Function secrets are available:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The included function is:

```text
supabase/functions/admin-users/index.ts
```

It verifies the signed-in actor, only allows Super Admin / Shop Admin administration, creates Auth users server-side, and writes audit entries.

---

# 5. Connect the web app to Supabase

Open `config.js` and change:

```js
window.HARDWARE_ERP_CONFIG = {
  appName: 'Hardware ERP',
  demoMode: false,
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY',
  currency: 'LKR',
  locale: 'en-LK',
  defaultTenant: 'tenant-demo',
  githubRepoName: 'hardware-erp'
};
```

Use the **publishable / anon client key only** in `config.js`. Never paste the secret/service-role key into GitHub or browser code.

Commit and push the change. GitHub Pages redeploys automatically.

---

# 6. First Supabase login

Login with:

```text
Username: Admin@123
Password: Admin@123#
```

The app converts `Admin@123` internally to the synthetic Auth email, authenticates with Supabase, loads the Super Admin profile, loads shops allowed by RLS, then loads tenant data.

The bootstrap creates a `Demo Hardware` tenant. If `seed_demo_data.sql` was run, there will also be initial products/customers/suppliers/stock.

---

# 7. Create another hardware shop

Login as Super Admin:

```text
Shop Management → Add Shop
```

Enter:

- Shop / Business Name
- Shop Code
- Phone
- Address
- First Shop Admin username
- Temporary password

In Supabase mode the app:

1. creates the tenant/shop,
2. creates tenant settings,
3. calls the secure `admin-users` Edge Function,
4. creates the Shop Admin in Supabase Auth,
5. links that profile to the tenant.

A Shop Admin can then create its own staff accounts but cannot see another tenant's data because RLS policies enforce tenant boundaries.

---

# 8. Password policy / why passwords are not viewable

The requested master control is implemented securely:

- Super Admin can create users
- reset any allowed user's password
- suspend/reactivate users
- edit roles/status
- use audited support access patterns

Existing passwords are **not readable**. Production authentication stores password hashes; a secure ERP should never decrypt and display staff passwords.

When a password is reset, show/copy the new temporary password once and require the user to change it later.

---

# 9. Bulk Excel workflow

Open:

```text
Bulk Data → choose operation
```

Supported starter operations:

- New / Update Products
- Selling Price Update
- Stock Adjustment
- Opening Stock
- Customers
- Suppliers

Workflow:

```text
Download Excel Template
→ Fill in Excel
→ Copy rows / Upload Excel
→ Validate
→ Review errors/warnings
→ Apply valid rows
```

Stock-related imports create movement-ledger entries instead of silently changing an unexplained stock number.

---

# 10. Production hardening before a real shop goes live

This package is a strong **trial / functional ERP foundation**, not an audited accounting product yet. Before using it for real-money daily operations, complete these items:

1. Move all critical multi-write flows into PostgreSQL RPC transactions / server functions:
   - POS sale
   - GRN
   - sales return
   - purchase return
   - transfer dispatch/receipt
   - invoice cancellation/reversal
2. Finish line-item editors for Purchase Orders / GRN / Quotations / Delivery Orders.
3. Implement invoice numbering locks, tax invoice configuration and immutable issued-document rules.
4. Add stock reservations and transfer-in-transit tables.
5. Add accounting journals / chart of accounts / bank reconciliation if full accounting is required.
6. Add document/PDF printing templates and receipt-printer handling.
7. Add automated backups, restore drills and production monitoring.
8. Review Sri Lankan VAT/SSCL/invoice requirements with the business accountant before production.
9. Add proper `must_change_password` enforcement and optional MFA for privileged users.
10. Replace broad trial sync with purpose-built RPC/API calls for each business transaction.

The included `post_stock_adjustment(...)` RPC demonstrates the intended atomic server-side pattern.

---

## Main files

```text
index.html
config.js
assets/styles.css
js/app.js
js/store.js
js/bulk.js
js/supabase.js
supabase/schema.sql
supabase/bootstrap_super_admin.sql
supabase/seed_demo_data.sql
supabase/functions/admin-users/index.ts
.github/workflows/pages.yml
manifest.webmanifest
sw.js
```

## Security rules to keep

- Never expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
- Keep RLS enabled on every exposed business table.
- Do not add a “View Password” feature.
- Do not delete stock movements/audit events; create reversals.
- Use minimum-price/discount approval server-side before production.
- Treat local demo mode as a UI test environment only.
