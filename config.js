/**
 * Hardware ERP runtime configuration.
 * The publishable key is safe to expose ONLY when RLS policies are enabled.
 * Never place a Supabase secret/service-role key in this file.
 */
window.HARDWARE_ERP_CONFIG = {
  appName: 'Hardware ERP',
  demoMode: false,
  supabaseUrl: 'https://zcfxmrhcttkyzofhmntd.supabase.co',
  supabasePublishableKey: 'sb_publishable_lVFjvEJRoosuZ7yj2jlQ0g_S00TMufv',
  currency: 'LKR',
  locale: 'en-LK',
  defaultTenant: 'tenant-demo',
  githubRepoName: 'hardware-erp'
};
