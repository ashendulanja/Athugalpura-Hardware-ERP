-- STEP 1: In Supabase Dashboard > Authentication > Users, create and confirm this user:
-- Email: admin_123@login.hardwareerp.local
-- Password: Admin@123#
-- This synthetic email represents the requested login username "Admin@123".
-- The web UI still accepts/displays Admin@123.
--
-- STEP 2: Run this SQL AFTER schema.sql.

insert into public.profiles (id, tenant_id, username, display_name, role, branch, status, must_change_password)
select id, null, 'Admin@123', 'System Super Admin', 'super_admin', 'All Shops', 'active', false
from auth.users
where lower(email) = 'admin_123@login.hardwareerp.local'
on conflict (id) do update set username=excluded.username, display_name=excluded.display_name, role=excluded.role, tenant_id=null, status='active';

-- Create a first trial tenant so Super Admin has a workspace immediately.
insert into public.shops(name,code,status,plan,address,phone)
values('Demo Hardware','DEMO','active','Trial','Kurunegala, Sri Lanka','')
on conflict(code) do nothing;

insert into public.app_settings(tenant_id,currency,vat_rate,sscl_rate,tax_registered,allow_negative_stock,discount_approval_pct)
select id,'LKR',18,2.5,false,false,10 from public.shops where code='DEMO'
on conflict(tenant_id) do nothing;
