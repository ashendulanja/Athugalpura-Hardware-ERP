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
  model text, manufacturer text, country text, specification text, aliases text, image_url text,
  max_stock numeric(18,4) not null default 0, reorder_qty numeric(18,4) not null default 0,
  base_uom text not null default 'PCS',
  purchase_uom text not null default 'PCS',
  uom_conversion numeric(18,6) not null default 1 check (uom_conversion > 0),
  uom_options jsonb not null default '[]'::jsonb,
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

-- Per-location stock derived from the same immutable movement ledger.
create view public.warehouse_stock_balances with (security_invoker = true) as
select p.tenant_id,p.id as product_id,p.sku,p.name,p.base_uom,
       coalesce(sm.warehouse,p.warehouse,'Unassigned') as warehouse,
       coalesce(sum(sm.quantity),0)::numeric(18,6) as physical_stock
from public.products p
left join public.stock_movements sm on sm.product_id=p.id and sm.tenant_id=p.tenant_id
group by p.tenant_id,p.id,p.sku,p.name,p.base_uom,coalesce(sm.warehouse,p.warehouse,'Unassigned');

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  po_no text not null, supplier_id uuid references public.suppliers(id), order_date date not null default current_date,
  expected_date date, status text not null default 'draft', total numeric(18,2) not null default 0,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,po_no)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade, line_no integer not null default 1,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_cost numeric(18,4) not null default 0, discount numeric(18,2) not null default 0, unique(purchase_order_id,line_no)
);
create table public.grns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  grn_no text not null, purchase_order_id uuid references public.purchase_orders(id), supplier_id uuid references public.suppliers(id),
  supplier_invoice_no text, received_date date not null default current_date, status text not null default 'received',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,grn_no)
);
create table public.grn_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  grn_id uuid not null references public.grns(id) on delete cascade, line_no integer not null default 1, product_id uuid not null references public.products(id),
  received_qty numeric(18,6) not null, damaged_qty numeric(18,6) not null default 0, free_qty numeric(18,6) not null default 0,
  unit_cost numeric(18,4) not null default 0, batch_no text, expiry_date date, unique(grn_id,line_no)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  invoice_no text not null, invoice_date date not null default current_date, customer_id uuid references public.customers(id),
  subtotal numeric(18,2) not null default 0, discount numeric(18,2) not null default 0, tax numeric(18,2) not null default 0,
  total numeric(18,2) not null default 0, cost_total numeric(18,2) not null default 0, paid_amount numeric(18,2) not null default 0, payment_method text, status text not null default 'paid',
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,invoice_no)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade, line_no integer not null default 1, product_id uuid not null references public.products(id),
  quantity numeric(18,6) not null, display_uom text, conversion_factor numeric(18,6) not null default 1, unit_price numeric(18,4) not null, unit_cost numeric(18,4) not null default 0,
  discount numeric(18,2) not null default 0,
  unique(invoice_id,line_no)
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

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade, line_no integer not null,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_price numeric(18,4) not null default 0, unit_cost numeric(18,4) not null default 0,
  unique(quotation_id,line_no)
);
create table public.sales_orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  order_no text not null, quote_no text, customer_id uuid references public.customers(id), order_date date not null default current_date,
  total numeric(18,2) not null default 0, status text not null default 'reserved', created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique(tenant_id,order_no)
);
create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade, line_no integer not null,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_price numeric(18,4) not null default 0, unit_cost numeric(18,4) not null default 0,
  unique(sales_order_id,line_no)
);
create table public.customer_returns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  return_no text not null, invoice_no text, product_id uuid references public.products(id), quantity numeric(18,6) not null,
  condition text not null, reason text, return_date date not null default current_date, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique(tenant_id,return_no)
);
create table public.stock_counts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  count_no text not null, product_id uuid not null references public.products(id), system_qty numeric(18,6) not null,
  counted_qty numeric(18,6) not null, variance numeric(18,6) not null, note text, count_date date not null default current_date,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,count_no)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  delivery_no text not null, invoice_id uuid references public.invoices(id), customer_id uuid references public.customers(id),
  site_address text, map_url text, vehicle text, driver text, packages integer not null default 0, status text not null default 'ready', receiver_name text,
  pod_reference text, pod_note text, proof_signature_url text, proof_photo_url text, delivered_at timestamptz, created_at timestamptz not null default now(), unique(tenant_id,delivery_no)
);
create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  claim_no text not null, product_id uuid references public.products(id), serial_no text not null, customer_id uuid references public.customers(id),
  received_at timestamptz not null default now(), status text not null default 'received', note text, unique(tenant_id,claim_no)
);
create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  payment_no text not null, supplier_id uuid references public.suppliers(id), payment_date date not null default current_date,
  amount numeric(18,2) not null, method text not null, reference text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(),
  unique(tenant_id,payment_no)
);
create table public.cheques (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  record_no text not null, direction text not null, cheque_no text not null, party_type text not null,
  customer_id uuid references public.customers(id), supplier_id uuid references public.suppliers(id), bank text, cheque_date date,
  amount numeric(18,2) not null, status text not null default 'in_hand', reference text, created_at timestamptz not null default now(),
  unique(tenant_id,record_no)
);
create table public.cash_shifts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  shift_no text not null, user_name text not null, opening_float numeric(18,2) not null default 0, expected_cash numeric(18,2) not null default 0,
  actual_cash numeric(18,2), variance numeric(18,2) not null default 0, status text not null default 'open', opened_at timestamptz not null default now(), closed_at timestamptz,
  unique(tenant_id,shift_no)
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
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Atomic stock adjustment RPC.
create or replace function public.post_stock_adjustment(p_product_id uuid, p_qty numeric, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_movement uuid; v_balance numeric; v_allow_negative boolean; v_warehouse text;
begin
  if p_qty = 0 then raise exception 'Adjustment quantity cannot be zero'; end if;
  select tenant_id,warehouse into v_tenant,v_warehouse from public.products where id=p_product_id for update;
  if v_tenant is null then raise exception 'Product not found'; end if;
  if not public.app_is_super_admin() and v_tenant <> public.app_tenant_id() then raise exception 'Access denied'; end if;
  if public.app_user_role() not in ('super_admin','shop_admin','manager','stores') then raise exception 'Insufficient permission'; end if;
  select coalesce(sum(quantity),0) into v_balance from public.stock_movements where tenant_id=v_tenant and product_id=p_product_id;
  select coalesce(allow_negative_stock,false) into v_allow_negative from public.app_settings where tenant_id=v_tenant;
  if not v_allow_negative and v_balance + p_qty < 0 then raise exception 'Insufficient stock'; end if;
  insert into public.stock_movements(tenant_id,product_id,movement_type,quantity,reference_type,reference_id,warehouse,reason,created_by)
    values(v_tenant,p_product_id,'ADJUSTMENT',p_qty,'ADJUSTMENT','ADJ-'||extract(epoch from clock_timestamp())::bigint,coalesce(v_warehouse,'Main Warehouse'),p_reason,auth.uid()) returning id into v_movement;
  insert into public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,detail)
    values(v_tenant,auth.uid(),'STOCK_ADJUST','product',p_product_id::text,format('Qty %s — %s',p_qty,p_reason));
  return v_movement;
end $$;
grant execute on function public.post_stock_adjustment(uuid,numeric,text) to authenticated;



-- Atomic warehouse transfer: two location movements, net company stock = 0.
create or replace function public.post_warehouse_transfer(
  p_product_id uuid, p_qty numeric, p_from_warehouse text, p_to_warehouse text,
  p_reference text default null, p_note text default null
) returns text language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_ref text; v_location_balance numeric;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Transfer quantity must be positive'; end if;
  if nullif(trim(p_from_warehouse),'') is null or nullif(trim(p_to_warehouse),'') is null then raise exception 'Both warehouse locations are required'; end if;
  if trim(p_from_warehouse)=trim(p_to_warehouse) then raise exception 'Source and destination must be different'; end if;
  select tenant_id into v_tenant from public.products where id=p_product_id for update;
  if v_tenant is null then raise exception 'Product not found'; end if;
  if not public.app_is_super_admin() and v_tenant <> public.app_tenant_id() then raise exception 'Access denied'; end if;
  if public.app_user_role() not in ('super_admin','shop_admin','manager','stores') then raise exception 'Insufficient permission'; end if;
  select coalesce(sum(quantity),0) into v_location_balance
  from public.stock_movements
  where tenant_id=v_tenant and product_id=p_product_id
    and coalesce(warehouse,(select warehouse from public.products where id=p_product_id),'Unassigned')=trim(p_from_warehouse);
  -- Existing projects may have old movements without warehouse data; total stock remains the final safety check in the UI.
  v_ref := coalesce(nullif(trim(p_reference),''),'TRF-'||extract(epoch from clock_timestamp())::bigint);
  insert into public.stock_movements(tenant_id,product_id,movement_type,quantity,reference_type,reference_id,warehouse,reason,created_by)
  values
    (v_tenant,p_product_id,'Transfer Out',-p_qty,'TRANSFER',v_ref,trim(p_from_warehouse),p_note,auth.uid()),
    (v_tenant,p_product_id,'Transfer In', p_qty,'TRANSFER',v_ref,trim(p_to_warehouse),p_note,auth.uid());
  insert into public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,detail)
  values(v_tenant,auth.uid(),'STOCK_TRANSFER','product',p_product_id::text,format('%s: %s -> %s; qty %s',v_ref,p_from_warehouse,p_to_warehouse,p_qty));
  return v_ref;
end $$;
grant execute on function public.post_warehouse_transfer(uuid,numeric,text,text,text,text) to authenticated;

-- Atomic POS sale: invoice + items + stock movements + payment/customer balance in one database transaction.
create or replace function public.post_sale_v2(
  p_tenant_id uuid, p_invoice_no text, p_customer_id uuid,
  p_subtotal numeric, p_discount numeric, p_tax numeric, p_total numeric,
  p_cost_total numeric, p_paid_amount numeric, p_payment_method text, p_items jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_invoice uuid; v_item jsonb; v_product uuid; v_qty numeric; v_price numeric; v_cost numeric; v_factor numeric; v_stock_qty numeric; v_uom text;
  v_balance numeric; v_allow_negative boolean; v_line integer := 0; v_status text; v_due numeric; v_warehouse text;
begin
  if p_tenant_id is null then raise exception 'Tenant required'; end if;
  if not public.app_is_super_admin() and p_tenant_id <> public.app_tenant_id() then raise exception 'Access denied'; end if;
  if public.app_user_role() not in ('super_admin','shop_admin','manager','cashier','sales') then raise exception 'Insufficient permission'; end if;
  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'Sale has no items'; end if;
  select coalesce(allow_negative_stock,false) into v_allow_negative from public.app_settings where tenant_id=p_tenant_id;
  v_due := greatest(coalesce(p_total,0)-coalesce(p_paid_amount,0),0);
  v_status := case when v_due <= 0.005 then 'paid' when coalesce(p_paid_amount,0)>0 then 'partial' else 'credit' end;
  insert into public.invoices(tenant_id,invoice_no,invoice_date,customer_id,subtotal,discount,tax,total,cost_total,paid_amount,payment_method,status,created_by)
  values(p_tenant_id,p_invoice_no,current_date,p_customer_id,coalesce(p_subtotal,0),coalesce(p_discount,0),coalesce(p_tax,0),coalesce(p_total,0),coalesce(p_cost_total,0),coalesce(p_paid_amount,0),p_payment_method,v_status,auth.uid())
  returning id into v_invoice;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_line := v_line + 1;
    v_product := (v_item->>'product_id')::uuid; v_qty := (v_item->>'quantity')::numeric; v_price := (v_item->>'unit_price')::numeric; v_cost := coalesce((v_item->>'unit_cost')::numeric,0); v_factor := greatest(coalesce((v_item->>'conversion_factor')::numeric,1),0.000001); v_uom := nullif(v_item->>'display_uom',''); v_stock_qty := v_qty*v_factor;
    if v_qty <= 0 then raise exception 'Invalid sale quantity'; end if;
    select warehouse into v_warehouse from public.products where id=v_product and tenant_id=p_tenant_id for update;
    if not found then raise exception 'Product not found or wrong tenant'; end if;
    select coalesce(sum(quantity),0) into v_balance from public.stock_movements where tenant_id=p_tenant_id and product_id=v_product;
    if not coalesce(v_allow_negative,false) and v_balance < v_stock_qty then raise exception 'Insufficient stock for product %', v_product; end if;
    insert into public.invoice_items(tenant_id,invoice_id,line_no,product_id,quantity,display_uom,conversion_factor,unit_price,unit_cost,discount)
      values(p_tenant_id,v_invoice,v_line,v_product,v_qty,v_uom,v_factor,v_price,v_cost,0);
    insert into public.stock_movements(tenant_id,product_id,movement_type,quantity,reference_type,reference_id,warehouse,created_by)
      values(p_tenant_id,v_product,'Sale',-v_stock_qty,'INVOICE',p_invoice_no,coalesce(v_warehouse,'Main Warehouse'),auth.uid());
  end loop;
  if coalesce(p_paid_amount,0)>0 then
    insert into public.payments(tenant_id,customer_id,invoice_id,amount,method,received_by)
      values(p_tenant_id,p_customer_id,v_invoice,p_paid_amount,coalesce(p_payment_method,'Cash'),auth.uid());
  end if;
  if p_customer_id is not null and v_due>0 then
    update public.customers set outstanding=outstanding+v_due where id=p_customer_id and tenant_id=p_tenant_id;
  end if;
  insert into public.audit_logs(tenant_id,actor_id,action,entity_type,entity_id,detail)
    values(p_tenant_id,auth.uid(),'SALE_POSTED','invoice',p_invoice_no,format('Total %s, paid %s, %s line(s)',p_total,p_paid_amount,v_line));
  return v_invoice;
end $$;
grant execute on function public.post_sale_v2(uuid,text,uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,jsonb) to authenticated;

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
alter table public.quotation_items enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.customer_returns enable row level security;
alter table public.stock_counts enable row level security;
alter table public.deliveries enable row level security;
alter table public.warranty_claims enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.cheques enable row level security;
alter table public.cash_shifts enable row level security;
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
  foreach t in array array['categories','brands','units','products','customers','suppliers','stock_movements','purchase_orders','purchase_order_items','grns','grn_items','invoices','invoice_items','payments','quotations','quotation_items','sales_orders','sales_order_items','customer_returns','stock_counts','deliveries','warranty_claims','supplier_payments','cheques','cash_shifts','expenses','audit_logs','app_settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_insert', t);
  end loop;
  -- Immutable ledgers (stock_movements, audit_logs) intentionally have no UPDATE policy.
  foreach t in array array['categories','brands','units','products','customers','suppliers','purchase_orders','purchase_order_items','grns','grn_items','invoices','invoice_items','payments','quotations','quotation_items','sales_orders','sales_order_items','customer_returns','stock_counts','deliveries','warranty_claims','supplier_payments','cheques','cash_shifts','expenses','app_settings'] loop
    execute format('create policy %I on public.%I for update to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin()) with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())', t||'_update', t);
  end loop;
end $$;

-- Audit logs intentionally have no DELETE policy.
-- Stock movements intentionally have no DELETE policy.
-- Destructive operations should be reversals, not erasure.

-- Tighten direct table privileges. RLS still applies to granted operations.
grant select, insert, update on public.shops,public.categories,public.brands,public.units,public.products,public.customers,public.suppliers,public.purchase_orders,public.purchase_order_items,public.grns,public.grn_items,public.invoices,public.invoice_items,public.payments,public.quotations,public.quotation_items,public.sales_orders,public.sales_order_items,public.customer_returns,public.stock_counts,public.deliveries,public.warranty_claims,public.supplier_payments,public.cheques,public.cash_shifts,public.expenses,public.app_settings to authenticated;
grant select on public.profiles to authenticated;
grant select, insert on public.stock_movements to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select on public.stock_balances, public.warehouse_stock_balances to authenticated;
grant usage, select on all sequences in schema public to authenticated;
