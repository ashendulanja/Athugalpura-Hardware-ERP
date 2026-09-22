# Supabase connection fix

This build is configured for:

`https://zcfxmrhcttkyzofhmntd.supabase.co`

Before deployment, edit `config.js` and replace:

`PASTE_YOUR_SUPABASE_PUBLISHABLE_KEY_HERE`

with the **Publishable key** from Supabase Dashboard > Project Settings > API Keys.

Do NOT use a secret/service-role key in the browser.

After deploying:
1. Open the site in an incognito/private window.
2. Sign in with `Admin@123` / `Admin@123#` after creating `admin_123@login.hardwareerp.local` in Supabase Auth and running `schema.sql` then `bootstrap_super_admin.sql`.
3. Open Settings. Database Connection should show Supabase configured.
4. Create a product.
5. In Supabase Table Editor > products, confirm the row exists.
6. Open another browser/private window and log in. The same product should appear.

If step 5 fails, the issue is not browser sync: it is Auth/RLS/schema/configuration.
