-- Optional demo data. Run after schema.sql + bootstrap_super_admin.sql.
-- Uses the shop code DEMO created by bootstrap_super_admin.sql.

do $$
declare t uuid; p1 uuid; p2 uuid; p3 uuid;
begin
  select id into t from public.shops where code='DEMO';
  if t is null then raise exception 'DEMO shop not found. Run bootstrap_super_admin.sql first.'; end if;

  insert into public.products(tenant_id,sku,barcode,name,category,brand,base_uom,purchase_uom,uom_conversion,avg_cost,retail_price,trade_price,wholesale_price,minimum_price,reorder_level,reserved_qty,warehouse,rack,serial_controlled)
  values
    (t,'ELE-CAB-25-BLK','4796001001011','Kelani Cable 2.5mm² Black','Electrical','Kelani','M','ROLL',100,205,295,275,258,245,250,42,'Main Warehouse','E04-B03',false),
    (t,'TLS-DRL-BOS-13','3165140987654','Bosch GSB 13 RE Impact Drill','Power Tools','Bosch','PCS','PCS',1,17800,22900,21500,20400,19800,6,2,'Showroom','T01-C02',true),
    (t,'BLD-CEM-INSEE-50','4796001001066','INSEE Sanstha Cement 50kg','Building Materials','INSEE','BAG','BAG',1,1920,2150,2090,2050,2010,100,55,'Yard','YARD-C1',false)
  on conflict(tenant_id,sku) do nothing;

  select id into p1 from public.products where tenant_id=t and sku='ELE-CAB-25-BLK';
  select id into p2 from public.products where tenant_id=t and sku='TLS-DRL-BOS-13';
  select id into p3 from public.products where tenant_id=t and sku='BLD-CEM-INSEE-50';

  if not exists(select 1 from public.stock_movements where tenant_id=t) then
    insert into public.stock_movements(tenant_id,product_id,movement_type,quantity,reference_type,reference_id,reason)
    values (t,p1,'OPENING',482.5,'OPENING','OPEN-001','Demo opening balance'),(t,p2,'OPENING',12,'OPENING','OPEN-002','Demo opening balance'),(t,p3,'OPENING',142,'OPENING','OPEN-003','Demo opening balance');
  end if;

  insert into public.customers(tenant_id,code,name,customer_type,phone,credit_limit,credit_days,outstanding,price_group)
  values (t,'CUS-0001','Walk-in Customer','Retail','',0,0,0,'Retail'),(t,'CUS-0012','Sunrise Construction (Pvt) Ltd','Contractor','0773218890',750000,30,328500,'Contractor')
  on conflict(tenant_id,code) do nothing;

  insert into public.suppliers(tenant_id,code,name,phone,contact_person,credit_days,payable)
  values (t,'SUP-001','Kelani Cables PLC','0115554411','Trade Sales',30,445000),(t,'SUP-002','Hardware Distribution Lanka','0112889010','Nuwan',45,812300)
  on conflict(tenant_id,code) do nothing;
end $$;
