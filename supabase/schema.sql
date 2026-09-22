-- Hardware ERP — Supabase/PostgreSQL schema
-- Run in Supabase SQL Editor on a fresh project.
-- IMPORTANT: create the first Auth user in Supabase Authentication first, then run bootstrap_super_admin.sql.

create extension if not exists pgcrypto;

create type public.app_role as enum ('super_admin','shop_admin','manager','cashier','sales','stores','accounts','delivery','auditor');
create type public.record_status as enum ('active','inactive','suspended');

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status public.record_status not null default 'active',
  plan text not null default 'Trial',
  address text,
  phone text,
  email text,
  brn text,
  vat_no text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.shops(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role public.app_role not null default 'cashier',
  branch text default 'Main Branch',
  status public.record_status not null default 'active',
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint super_admin_tenant check ((role = 'super_admin' and tenant_id is null) or role <> 'super_admin')
);

-- These SECURITY DEFINER helpers prevent recursive RLS lookups.
create or replace function public.app_user_role()
returns public.app_role language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and status = 'active' $$;

create or replace function public.app_tenant_id()
returns uuid language sql stable security definer set search_path = public
as $$ select tenant_id from public.profiles where id = auth.uid() and status = 'active' $$;

create or replace function public.app_is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'super_admin' and status = 'active' from public.profiles where id = auth.uid()), false) $$;

revoke all on function public.app_user_role() from public;
revoke all on function public.app_tenant_id() from public;
revoke all on function public.app_is_super_admin() from public;
grant execute on function public.app_user_role() to authenticated;
grant execute on function public.app_tenant_id() to authenticated;
grant execute on function public.app_is_super_admin() to authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  name text not null, parent_id uuid references public.categories(id), active boolean not null default true,
  unique(tenant_id,name)
);
create table public.brands (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  name text not null, active boolean not null default true, unique(tenant_id,name)
);
create table public.units (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  code text not null, name text not null, allow_decimal boolean not null default false, unique(tenant_id,code)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.shops(id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  category text,
  brand text,
  base_uom text not null default 'PCS',
  purchase_uom text not null default 'PCS',
  uom_conversion numeric(18,6) not null default 1 check (uom_conversion > 0),
  avg_cost numeric(18,4) not null default 0 check (avg_cost >= 0),
  retail_price numeric(18,4) not null default 0,
  trade_price numeric(18,4) not null default 0,
  wholesale_price numeric(18,4) not null default 0,
  minimum_price numeric(18,4) not null default 0,
  reorder_level numeric(18,4) not null default 0,
  reserved_qty numeric(18,6) not null default 0,
  warehouse text default 'Main Warehouse',
  rack text,
  serial_controlled boolean not null default false,
  batch_controlled boolean not null default false,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id,sku)
);
create unique index products_tenant_barcode_uq on public.products(tenant_id,barcode) where barcode is not null and barcode <> '';

create table public.customers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  code text not null, name text not null, customer_type text default 'Retail', phone text, email text,
  credit_limit numeric(18,2) not null default 0, credit_days integer not null default 0,
  outstanding numeric(18,2) not null default 0, price_group text default 'Retail', status public.record_status not null default 'active',
  created_at timestamptz not null default now(), unique(tenant_id,code)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  code text not null, name text not null, phone text, contact_person text, credit_days integer not null default 0,
  payable numeric(18,2) not null default 0, status public.record_status not null default 'active', created_at timestamptz not null default now(),
  unique(tenant_id,code)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id), movement_type text not null,
  quantity numeric(18,6) not null check (quantity <> 0), reference_type text, reference_id text,
  warehouse text, reason text, created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements(tenant_id,product_id,created_at desc);

-- Stock is derived from the movement ledger, not silently overwritten.
create view public.stock_balances with (security_invoker = true) as
select p.tenant_id,p.id as product_id,p.sku,p.name,p.base_uom,
       coalesce(sum(sm.quantity),0)::numeric(18,6) as physical_stock
from public.products p
left join public.stock_movements sm on sm.product_id=p.id and sm.tenant_id=p.tenant_id
group by p.tenant_id,p.id,p.sku,p.name,p.base_uom;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  po_no text not null, supplier_id uuid references public.suppliers(id), order_date date not null default current_date,
  expected_date date, status text not null default 'draft', total numeric(18,2) not null default 0,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,po_no)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_cost numeric(18,4) not null default 0, discount numeric(18,2) not null default 0
);
create table public.grns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  grn_no text not null, purchase_order_id uuid references public.purchase_orders(id), supplier_id uuid references public.suppliers(id),
  supplier_invoice_no text, received_date date not null default current_date, status text not null default 'received',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,grn_no)
);
create table public.grn_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  grn_id uuid not null references public.grns(id) on delete cascade, product_id uuid not null references public.products(id),
  received_qty numeric(18,6) not null, damaged_qty numeric(18,6) not null default 0, free_qty numeric(18,6) not null default 0,
  unit_cost numeric(18,4) not null default 0, batch_no text, expiry_date date
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  invoice_no text not null, invoice_date date not null default current_date, customer_id uuid references public.customers(id),
  subtotal numeric(18,2) not null default 0, discount numeric(18,2) not null default 0, tax numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0, cost_total numeric(18,2) not null default 0, payment_method text, status text not null default 'paid',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,invoice_no)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade, product_id uuid not null references public.products(id),
  quantity numeric(18,6) not null, unit_price numeric(18,4) not null, unit_cost numeric(18,4) not null default 0,
  discount numeric(18,2) not null default 0
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid references public.customers(id), invoice_id uuid references public.invoices(id), amount numeric(18,2) not null,
  method text not null, reference text, received_by uuid references public.profiles(id), created_at timestamptz not null default now()
);

create table public.quotations (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  quote_no text not null, customer_id uuid references public.customers(id), quote_date date not null default current_date,
  valid_until date, total numeric(18,2) not null default 0, status text not null default 'draft', created_by uuid references public.profiles(id), unique(tenant_id,quote_no)
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  delivery_no text not null, invoice_id uuid references public.invoices(id), customer_id uuid references public.customers(id),
  site_address text, map_url text, vehicle text, driver text, status text not null default 'ready', receiver_name text,
  proof_signature_url text, proof_photo_url text, delivered_at timestamptz, created_at timestamptz not null default now(), unique(tenant_id,delivery_no)
);
create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  claim_no text not null, product_id uuid references public.products(id), serial_no text not null, customer_id uuid references public.customers(id),
  received_at timestamptz not null default now(), status text not null default 'received', note text, unique(tenant_id,claim_no)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  expense_no text not null, expense_date date not null default current_date, category text not null, description text, amount numeric(18,2) not null,
  status text not null default 'approved', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,expense_no)
);
create table public.audit_logs (
  id bigint generated always as identity primary key, tenant_id uuid references public.shops(id) on delete cascade,
  actor_id uuid references public.profiles(id), action text not null, entity_type text, entity_id text,
  old_data jsonb, new_data jsonb, detail text, client_event_id text, created_at timestamptz not null default now()
);
create unique index audit_logs_client_event_uq on public.audit_logs(tenant_id,client_event_id);

create table public.app_settings (
  tenant_id uuid primary key references public.shops(id) on delete cascade,
  currency text not null default 'LKR', vat_rate numeric(7,4) not null default 18,
  sscl_rate numeric(7,4) not null default 2.5, tax_registered boolean not null default false,
  allow_negative_stock boolean not null default false, discount_approval_pct numeric(7,3) not null default 10,
  updated_at timestamptz not null default now()
);

-- Atomic stock adjustment RPC.
create or replace function public.post_stock_adjustment(p_product_id uuid, p_qty numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_movement uuid; v_balance numeric; v_allow_negative boolean;
begin
  if p_qty = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  select tenant_id into v_tenant from public.products where id=p_product_id for update;
  if v_tenant is null then raise exception 'Product not found'; end if;
  if not public.app_is_super_admin() and v_tenant <> public.app_tenant_id() then raise exception 'Access denied'; end if;
  if public.app_user_role() not in ('super_admin','shop_admin','manager','stores') then raise exception 'Insufficient permission'; end if;
  select coalesce(sum(quantity),0) into v_balance from public.stock_movements where tenant_id=v_tenant and product_id=p_product_id;
  select coalesce(allow_negative_stock,false) into v_allow_negative from public.app_settings where tenant_id=v_tenant;
  if not v_allow_negative and v_balance + p_qty < 0 then raise exception 'Insufficient stock'; end if;
  insert into public.stock_movements(tenant_id,product_id,movement_type,quantity,reference_type,reference_id,reason,created_by)
    values(v_tenant,p_product_id,'ADJUSTMENT',p_qty,'ADJUSTMENT','ADJ-'||extract(epoch from clock_timestamp())::bigint,p_reason,auth.uid()) returning id into v_movement;
  insert into public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,detail)
    values(v_tenant,auth.uid(),'STOCK_ADJUST','product',p_product_id::text,format('Qty %s — %s',p_qty,p_reason));
  return v_movement;
end $$;
grant execute on function public.post_stock_adjustment(uuid,numeric,text) to authenticated;

-- RLS: every tenant-owned row is isolated; Super Admin may cross tenants.
alter table public.shops enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.units enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.grns enable row level security;
alter table public.grn_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.quotations enable row level security;
alter table public.deliveries enable row level security;
alter table public.warranty_claims enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

create policy shops_select on public.shops for select to authenticated using (id=public.app_tenant_id() or public.app_is_super_admin());
create policy shops_super_manage on public.shops for all to authenticated using (public.app_is_super_admin()) with check (public.app_is_super_admin());
create policy profiles_select on public.profiles for select to authenticated using (tenant_id=public.app_tenant_id() or id=auth.uid() or public.app_is_super_admin());
create policy profiles_admin_manage on public.profiles for all to authenticated using (public.app_is_super_admin() or (public.app_user_role()='shop_admin' and tenant_id=public.app_tenant_id())) with check (public.app_is_super_admin() or (public.app_user_role()='shop_admin' and tenant_id=public.app_tenant_id()));

-- Generate standard tenant isolation policies for business tables.
do $$
declare t text;
begin
  foreach t in array array['categories','brands','units','products','customers','suppliers','stock_movements','purchase_orders','purchase_order_items','grns','grn_items','invoices','invoice_items','payments','quotations','deliveries','warranty_claims','expenses','audit_logs','app_settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_insert', t);
  end loop;
  -- Immutable ledgers (stock_movements, audit_logs) intentionally have no UPDATE policy.
  foreach t in array array['categories','brands','units','products','customers','suppliers','purchase_orders','purchase_order_items','grns','grn_items','invoices','invoice_items','payments','quotations','deliveries','warranty_claims','expenses','app_settings'] loop
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin()) with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_update', t);
  end loop;
end $$;

-- Audit logs intentionally have no DELETE policy.
-- Stock movements intentionally have no DELETE policy.
-- Destructive operations should be reversals, not erasure.

-- Tighten direct table privileges. RLS still applies to granted operations.
grant select, insert, update on public.shops,public.categories,public.brands,public.units,public.products,public.customers,public.suppliers,public.purchase_orders,public.purchase_order_items,public.grns,public.grn_items,public.invoices,public.invoice_items,public.payments,public.quotations,public.deliveries,public.warranty_claims,public.expenses,public.app_settings to authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.stock_movements to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select on public.stock_balances to authenticated;
grant usage, select on all sequences in schema public to authenticated;
