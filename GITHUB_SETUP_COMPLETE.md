# Hardware ERP - GitHub + Supabase Complete Setup

## Correct repository structure

Your GitHub repository root must contain:

```text
.github/
  workflows/
    pages.yml
assets/
  logo.svg
  styles.css
js/
  app.js
  bulk.js
  store.js
  supabase.js
supabase/
  bootstrap_super_admin.sql
  schema.sql
  seed_demo_data.sql
  functions/
    admin-users/
      index.ts
.nojekyll
config.js
index.html
manifest.webmanifest
sw.js
README.md
SETUP_SINHALA.md
GITHUB_SETUP_COMPLETE.md
```

Do not upload only the root files. The `js`, `assets`, `supabase`, and `.github` folders are required.

## Recommended Windows upload: GitHub Desktop

1. Extract `hardware-erp.zip`.
2. Install GitHub Desktop from https://desktop.github.com/ and sign in.
3. On GitHub.com create a repository named `hardware-erp`. For GitHub Free + Pages, make it Public.
4. In GitHub Desktop choose File > Add Local Repository > Choose, then select the extracted `hardware-erp` folder.
5. If GitHub Desktop says it is not a repository, choose `create a repository here`.
6. Repository name: `hardware-erp`. Keep Local path as the extracted folder. Do not add another README/gitignore/license because the project already contains files.
7. Click Create Repository.
8. Check the Changes list. It should include files under `.github`, `assets`, `js`, and `supabase`.
9. Summary: `Initial Hardware ERP upload` > Commit to main.
10. Click Publish repository. Select the GitHub account. If using GitHub Free Pages, keep the repository Public.
11. Open the repository on GitHub.com and verify the folder structure above.

## GitHub Pages

1. Repository > Settings > Pages.
2. Under Build and deployment > Source choose `GitHub Actions`.
3. Go to Actions. The `Deploy Hardware ERP to GitHub Pages` workflow should run.
4. If needed, select the workflow > Run workflow > main > Run workflow.
5. When green, Settings > Pages will show the live URL.
6. Demo login: `Admin@123` / `Admin@123#`.

## Browser-only upload alternative

On GitHub > repository > Add file > Upload files, do NOT click Choose your files and select only root files. Instead, in Windows File Explorer open the extracted `hardware-erp` folder, select ALL contents including `.github`, `assets`, `js`, and `supabase`, and drag the selection into GitHub's upload drop area. Verify nested paths before committing.

## Supabase setup

### 1. Create project
Create a new Supabase project and wait until provisioning completes.

### 2. Create Super Admin Auth user
Authentication > Users > Add user/Create user:

- Email: `admin_123@login.hardwareerp.local`
- Password: `Admin@123#`
- Confirm the user.

The app login remains `Admin@123` because it maps the username to the synthetic auth email.

### 3. Run SQL
Supabase > SQL Editor. Open each project file locally and paste/run in this order:

1. `supabase/schema.sql`
2. `supabase/bootstrap_super_admin.sql`
3. `supabase/seed_demo_data.sql` (optional demo records)

Run each file separately and make sure there are no red errors before proceeding.

### 4. Deploy admin-users Edge Function
Easiest dashboard method:

1. Supabase > Edge Functions > Deploy a new function > Via Editor.
2. Function name: `admin-users`.
3. Replace editor contents with everything from `supabase/functions/admin-users/index.ts`.
4. Deploy.

Supabase automatically provides project function environment variables such as project URL/keys in hosted Edge Functions. Never copy the service-role/secret key into `config.js` or the GitHub frontend.

CLI alternative:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy admin-users
```

### 5. Get browser-safe Supabase values
Supabase > Project Settings > API (or API Keys):

- Project URL
- Publishable key

Do NOT use the secret/service-role key in the website.

### 6. Edit config.js
Set:

```js
window.HARDWARE_ERP_CONFIG = {
  appName: 'Hardware ERP',
  demoMode: false,
  supabaseUrl: 'https://YOUR_PROJECT_REF.supabase.co',
  supabasePublishableKey: 'YOUR_PUBLISHABLE_KEY',
  currency: 'LKR',
  locale: 'en-LK',
  defaultTenant: 'tenant-demo',
  githubRepoName: 'hardware-erp'
};
```

Commit/push `config.js`. GitHub Actions redeploys Pages automatically.

### 7. Test cloud mode
Open the Pages URL in a private/incognito window and sign in:

- Username: `Admin@123`
- Password: `Admin@123#`

Test Products, Bulk Data, Users and Shops. Refresh the browser and sign in from another device to confirm cloud persistence.

## Common problems

### Only 7 files uploaded
You uploaded only the root files. Use GitHub Desktop or drag the folders as well.

### Blank page / missing styling
`js/` or `assets/` is missing, or files are in the wrong root. `index.html` must be at repository root.

### GitHub Pages 404
Ensure `index.html` is at root, Pages source is GitHub Actions, and the workflow is green.

### Workflow does not appear
`.github/workflows/pages.yml` is missing from the repository.

### Demo data resets between devices
You are still in `demoMode: true`; demo mode uses browser local storage. Configure Supabase and change it to `false`.

### Supabase login fails
Confirm the Auth user `admin_123@login.hardwareerp.local` exists, then run `bootstrap_super_admin.sql` after `schema.sql`.

### Add User / Reset Password fails
Check that the `admin-users` Edge Function is deployed and you are logged in as Super Admin or Shop Admin.
