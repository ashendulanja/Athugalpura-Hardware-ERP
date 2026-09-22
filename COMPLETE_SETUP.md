# Hardware ERP Complete — Setup (GitHub Pages + Supabase)

## 1. What this build contains
- Responsive desktop/tablet/mobile UI
- Dark + Light mode
- Dashboard / Command Center
- Fast POS with multi-UOM, fractional quantities, customer selection, hold/resume, discount/tax/payment
- Invoice history + A4 invoice print + 58/80mm POS receipt print
- Barcode & Label Studio: 22x10, 30x15, 30x20, 35x25, 40x45, 50x25, 50x30, 50x35, 57.5x40, 75x50, 100x50, 100x75, 100x150 and Custom mm
- Label field controls: name, brand, model, category, specification, SKU, UOM, rack/bin, price, barcode number, 2 custom lines
- CODE128 / EAN13 / CODE39 / ITF14 selection
- Products, UOM conversions, pricing, reorder controls, serial/batch flags
- Inventory ledger, adjustments, blind count, transfers, returns
- Purchase Orders + GRN + weighted cost update
- Quotations + Sales Orders + stock reservation
- Customers + credit limits/outstanding
- Suppliers + payables
- Delivery + pick list + POD status
- Warranty / serial claims
- Finance: receipts, supplier payments, cheques, cash shifts, expenses
- Reports + CSV exports
- Control Center + audit trail
- Bulk Excel template / paste / XLSX upload / validation / preview
- Multi-shop Super Admin + shop admins + staff accounts
- Supabase Auth + PostgreSQL/RLS architecture

## 2. GitHub upload
Use GitHub Desktop. Put the *contents* of this folder in the local repository root. The GitHub repository root must contain:

```
index.html
config.js
assets/
js/
supabase/
.github/
manifest.webmanifest
sw.js
```

Commit and Push/Publish. In GitHub: Settings -> Pages -> Source = GitHub Actions.

## 3. Supabase project
Project base URL already configured:

`https://zcfxmrhcttkyzofhmntd.supabase.co`

In Supabase, copy the **Publishable key** (not secret/service_role).
Edit `config.js`:

```
demoMode: false,
supabaseUrl: 'https://zcfxmrhcttkyzofhmntd.supabase.co',
supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY'
```

Never put a secret/service_role key in config.js or GitHub.

## 4. Database SQL — run in this order
Supabase -> SQL Editor:

1. `supabase/schema.sql`
2. `supabase/upgrade_v3_complete_erp.sql`
3. Create the Auth user (next step)
4. `supabase/bootstrap_super_admin.sql`
5. Optional: `supabase/seed_demo_data.sql`

If this project already has the old schema, run `upgrade_v3_complete_erp.sql` to add the complete operational tables/columns/functions.

## 5. Super Admin Auth user
Supabase -> Authentication -> Users -> Add user

Email: `admin_123@login.hardwareerp.local`
Password: `Admin@123#`

Then run `bootstrap_super_admin.sql`.

The web login remains:
- Username: `Admin@123`
- Password: `Admin@123#`

Change the password after testing.

## 6. Admin user Edge Function
Deploy `supabase/functions/admin-users/index.ts` as an Edge Function named `admin-users`.
This handles privileged user creation/reset server-side. Do not expose the service-role key in the browser.

## 7. Verify cloud data really works
1. Login to the hosted site.
2. Settings -> Database Connection must show configured / session mode `supabase`.
3. Add a test product.
4. Supabase -> Table Editor -> `products`: confirm the row exists.
5. Open an Incognito window or another browser, login and confirm the same product appears.

If the product only appears in one browser, the app is still in local/demo mode or the SQL/RLS/config is incomplete.

## 8. Printing
### Invoice
After a POS sale: choose `Print A4 Invoice` or `Print POS`.
Invoices page also has reprint controls.
POS paper size is configured in Settings (58mm / 80mm).

### Barcode labels
Open `Barcode Studio`.
Choose product -> label size -> thermal roll/A4 -> fields -> copies -> Add to Print Queue -> Print.
For exact thermal label output, set the browser print dialog to:
- Scale 100%
- Margins None / Default printer-controlled
- Correct printer stock size
- Headers/Footers Off

## 9. Mobile
Open the GitHub Pages URL on Android/iPhone. The app uses responsive layouts and a bottom mobile navigation bar. It can be installed as a PWA from supported browsers.

## 10. Production note
For a real live shop, test barcode printers, receipt printers, A4 invoice layout, VAT configuration, stock opening balances, roles/RLS and backup/restore before going live. Use Supabase backups/paid plan appropriate to the transaction volume.
