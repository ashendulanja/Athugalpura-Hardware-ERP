# Hardware ERP — Setup Guide (Sinhala / Roman)

## Danma system eka balanna

1. `hardware-erp.zip` extract karanna.
2. Folder eka athule terminal / CMD open karanna.
3. Me command eka run karanna:

```bash
python -m http.server 8080
```

4. Browser eke `http://localhost:8080` open karanna.
5. Login:

```text
Username: Admin@123
Password: Admin@123#
```

Me stage eke data browser `localStorage` eke demo widihata save wenawa.

---

## GitHub eke dala free host karanna

1. GitHub eke `hardware-erp` kiyala repository ekak hadanna.
2. Zip eke files tika repo root ekata upload karanna.
3. `main` branch ekata commit karanna.
4. Repository `Settings → Pages` yanna.
5. `Source / Build and deployment` walin **GitHub Actions** select karanna.
6. Package eke `.github/workflows/pages.yml` file eka automatic deploy karanawa.
7. Actions pass unama GitHub Pages URL eka open karanna.

---

## Supabase Database eka connect karanna

### A. Project eka hadanna

Supabase eke new project ekak create karanna.

### B. Super Admin Auth user eka hadanna

`Authentication → Users → Add user`:

```text
Email: admin_123@login.hardwareerp.local
Password: Admin@123#
```

User eka confirm karanna.

App eke login karaddi email eka type karanne naha. App eke username eka:

```text
Admin@123
```

### C. SQL files run karanna

Supabase `SQL Editor` eke me order ekata run karanna:

1. `supabase/schema.sql`
2. `supabase/bootstrap_super_admin.sql`
3. `supabase/seed_demo_data.sql` (demo data one nam)

### D. Admin user Edge Function eka deploy karanna

Supabase CLI setup karala project eka link karala:

```bash
supabase functions deploy admin-users
```

Me function eka Shop Admin / staff account create, password reset, role/status update wage secure admin dewal karanawa.

### E. `config.js` update karanna

Supabase `Project URL` saha `Publishable Key` aran:

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

`service_role` / secret key eka `config.js` eke danna EPA. Eka browser/GitHub walata expose wenna ba.

Config change eka GitHub ekata push karama Pages auto redeploy wenawa.

---

## Aluth shop ekak hadanna

Super Admin login → `Shop Management → Add Shop`.

Shop details + Shop Admin username + temporary password denna.

Supabase mode eke shop eka separate tenant ekak widihata create wela RLS nisa wena shop ekaka data penne naha.

---

## Staff account hadanna

`User Management → Add User`

Roles:

- Shop Admin
- Manager
- Cashier
- Sales
- Stores
- Accounts
- Delivery
- Auditor

Existing password eka balanna system eka design karala naha. Super Admin / Shop Admin permission anuwa **Reset Password** karanna puluwan. Meeka secure method eka.

---

## Excel Bulk Update

`Bulk Data` yanna.

1. Update type eka select karanna.
2. `Download Excel Template`.
3. Excel eke data type karanna.
4. Rows copy karala paste karanna, nathnam Excel file upload karanna.
5. `Validate Data`.
6. Errors/warnings balanna.
7. `Apply` karanna.

Products, prices, opening stock, stock adjustment, customers, suppliers starter version eke support wenawa.

---

## Real shop ekakata live karanna kalin

Me package eka trial + strong ERP foundation ekak. Real daily billing/accounting walata yanna kalin:

- POS sale atomic database RPC
- GRN line items + atomic receiving
- Returns / transfers
- Tax invoice & PDF print formats
- Full accounting journals / bank reconciliation (one nam)
- backup + restore testing
- VAT / SSCL / invoice rules accountant kenek ekka final verify

complete karanna.
