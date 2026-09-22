-- Hardware ERP v3 upgrade for an EXISTING Supabase project.
-- Safe to run after the original schema.sql.

alter table public.invoices add column if not exists paid_amount numeric(18,2) not null default 0;
alter table public.invoice_items add column if not exists line_no integer;
alter table public.invoice_items add column if not exists display_uom text;
alter table public.invoice_items add column if not exists conversion_factor numeric(18,6) not null default 1;

update public.invoice_items ii set line_no=x.rn
from (
  select id,row_number() over(partition by invoice_id order by id) rn from public.invoice_items where line_no is null
) x where ii.id=x.id;
alter table public.invoice_items alter column line_no set default 1;
alter table public.invoice_items alter column line_no set not null;
create unique index if not exists invoice_items_invoice_line_uq on public.invoice_items(invoice_id,line_no);
alter table public.app_settings add column if not exists settings_json jsonb not null default '{}'::jsonb;


-- Location-aware stock ledger upgrade.
alter table public.stock_movements add column if not exists warehouse text;
drop view if exists public.warehouse_stock_balances;
create view public.warehouse_stock_balances with (security_invoker = true) as
select p.tenant_id,p.id as product_id,p.sku,p.name,p.base_uom,
       coalesce(sm.warehouse,p.warehouse,'Unassigned') as warehouse,
       coalesce(sum(sm.quantity),0)::numeric(18,6) as physical_stock
from public.products p
left join public.stock_movements sm on sm.product_id=p.id and sm.tenant_id=p.tenant_id
group by p.tenant_id,p.id,p.sku,p.name,p.base_uom,coalesce(sm.warehouse,p.warehouse,'Unassigned');
grant select on public.warehouse_stock_balances to authenticated;

create or replace function public.post_warehouse_transfer(
  p_product_id uuid, p_qty numeric, p_from_warehouse text, p_to_warehouse text,
  p_reference text default null, p_note text default null
) returns text language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_ref text;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Transfer quantity must be positive'; end if;
  if nullif(trim(p_from_warehouse),'') is null or nullif(trim(p_to_warehouse),'') is null then raise exception 'Both warehouse locations are required'; end if;
  if trim(p_from_warehouse)=trim(p_to_warehouse) then raise exception 'Source and destination must be different'; end if;
  select tenant_id into v_tenant from public.products where id=p_product_id for update;
  if v_tenant is null then raise exception 'Product not found'; end if;
  if not public.app_is_super_admin() and v_tenant <> public.app_tenant_id() then raise exception 'Access denied'; end if;
  if public.app_user_role() not in ('super_admin','shop_admin','manager','stores') then raise exception 'Insufficient permission'; end if;
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

-- Atomic POS sale: invoice + item lines + stock ledger + payment/outstanding.
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
    v_product := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'unit_price')::numeric;
    v_cost := coalesce((v_item->>'unit_cost')::numeric,0);
    v_factor := greatest(coalesce((v_item->>'conversion_factor')::numeric,1),0.000001);
    v_uom := nullif(v_item->>'display_uom','');
    v_stock_qty := v_qty*v_factor;
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

-- Ensure browser-side invoice line upserts are allowed through existing tenant RLS policies.
grant select,insert,update on public.invoice_items to authenticated;
grant select,insert,update on public.invoices to authenticated;


-- Purchase-order line numbering for full line-item PO editor.
alter table public.purchase_order_items add column if not exists line_no integer;
update public.purchase_order_items poi set line_no=x.rn
from (select id,row_number() over(partition by purchase_order_id order by id) rn from public.purchase_order_items where line_no is null) x
where poi.id=x.id;
alter table public.purchase_order_items alter column line_no set default 1;
alter table public.purchase_order_items alter column line_no set not null;
create unique index if not exists purchase_order_items_order_line_uq on public.purchase_order_items(purchase_order_id,line_no);

-- Additional operational tables used by the complete trial UI.
alter table public.grn_items add column if not exists line_no integer;
update public.grn_items gi set line_no=x.rn from (select id,row_number() over(partition by grn_id order by id) rn from public.grn_items where line_no is null) x where gi.id=x.id;
alter table public.grn_items alter column line_no set default 1;
alter table public.grn_items alter column line_no set not null;
create unique index if not exists grn_items_grn_line_uq on public.grn_items(grn_id,line_no);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  quotation_id uuid not null references public.quotations(id) on delete cascade, line_no integer not null,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_price numeric(18,4) not null default 0, unit_cost numeric(18,4) not null default 0,
  unique(quotation_id,line_no)
);
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  order_no text not null, quote_no text, customer_id uuid references public.customers(id), order_date date not null default current_date,
  total numeric(18,2) not null default 0, status text not null default 'reserved', created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,order_no)
);
create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade, line_no integer not null,
  product_id uuid not null references public.products(id), quantity numeric(18,6) not null,
  unit_price numeric(18,4) not null default 0, unit_cost numeric(18,4) not null default 0,
  unique(sales_order_id,line_no)
);
create table if not exists public.customer_returns (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  return_no text not null, invoice_no text, product_id uuid references public.products(id), quantity numeric(18,6) not null,
  condition text not null, reason text, return_date date not null default current_date, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,return_no)
);
create table if not exists public.stock_counts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  count_no text not null, product_id uuid not null references public.products(id), system_qty numeric(18,6) not null,
  counted_qty numeric(18,6) not null, variance numeric(18,6) not null, note text, count_date date not null default current_date,
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,count_no)
);

alter table public.quotation_items enable row level security;
alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;
alter table public.customer_returns enable row level security;
alter table public.stock_counts enable row level security;

do $$
declare t text; pol text;
begin
  foreach t in array array['quotation_items','sales_orders','sales_order_items','customer_returns','stock_counts'] loop
    pol=t||'_select'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for select to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
    pol=t||'_insert'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
    pol=t||'_update'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for update to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin()) with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
  end loop;
end $$;

grant select,insert,update on public.quotation_items,public.sales_orders,public.sales_order_items,public.customer_returns,public.stock_counts to authenticated;


-- Delivery workflow fields used by dispatch/POD screens.
alter table public.deliveries add column if not exists packages integer not null default 0;
alter table public.deliveries add column if not exists pod_reference text;
alter table public.deliveries add column if not exists pod_note text;


-- Finance operations: supplier settlements, cheque lifecycle and cashier shifts.
create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  payment_no text not null, supplier_id uuid references public.suppliers(id), payment_date date not null default current_date,
  amount numeric(18,2) not null, method text not null, reference text, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), unique(tenant_id,payment_no)
);
create table if not exists public.cheques (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  record_no text not null, direction text not null, cheque_no text not null, party_type text not null,
  customer_id uuid references public.customers(id), supplier_id uuid references public.suppliers(id), bank text, cheque_date date,
  amount numeric(18,2) not null, status text not null default 'in_hand', reference text, created_at timestamptz not null default now(), unique(tenant_id,record_no)
);
create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.shops(id) on delete cascade,
  shift_no text not null, user_name text not null, opening_float numeric(18,2) not null default 0, expected_cash numeric(18,2) not null default 0,
  actual_cash numeric(18,2), variance numeric(18,2) not null default 0, status text not null default 'open', opened_at timestamptz not null default now(), closed_at timestamptz, unique(tenant_id,shift_no)
);
alter table public.supplier_payments enable row level security;
alter table public.cheques enable row level security;
alter table public.cash_shifts enable row level security;
do $$
declare t text; pol text;
begin
  foreach t in array array['supplier_payments','cheques','cash_shifts'] loop
    pol=t||'_select'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for select to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
    pol=t||'_insert'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for insert to authenticated with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
    pol=t||'_update'; if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pol) then execute format('create policy %I on public.%I for update to authenticated using (tenant_id=public.app_tenant_id() or public.app_is_super_admin()) with check (tenant_id=public.app_tenant_id() or public.app_is_super_admin())',pol,t); end if;
  end loop;
end $$;
grant select,insert,update on public.supplier_payments,public.cheques,public.cash_shifts to authenticated;

-- Rich product-master fields.
alter table public.products add column if not exists model text;
alter table public.products add column if not exists manufacturer text;
alter table public.products add column if not exists country text;
alter table public.products add column if not exists specification text;
alter table public.products add column if not exists aliases text;
alter table public.products add column if not exists image_url text;
alter table public.products add column if not exists max_stock numeric(18,4) not null default 0;
alter table public.products add column if not exists reorder_qty numeric(18,4) not null default 0;

alter table public.products add column if not exists uom_options jsonb not null default '[]'::jsonb;
