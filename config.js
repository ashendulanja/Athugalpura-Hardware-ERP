/**
 * Hardware ERP runtime configuration.
 * The publishable key is safe to expose ONLY when RLS policies are enabled.
 * Never place a Supabase secret/service-role key in this file.
 */
window.HARDWARE_ERP_CONFIG = {
  appName: 'Hardware ERP',
  demoMode: true,
  supabaseUrl: '',
  supabasePublishableKey: '',
  currency: 'LKR',
  locale: 'en-LK',
  defaultTenant: 'tenant-demo',
  githubRepoName: 'hardware-erp'
};
