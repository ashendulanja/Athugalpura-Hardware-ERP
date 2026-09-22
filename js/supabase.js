const cfg = window.HARDWARE_ERP_CONFIG || {};
export const isSupabaseConfigured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && !String(cfg.supabasePublishableKey).includes('PASTE_YOUR_') && window.supabase);
export const supabaseClient = isSupabaseConfigured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;

export function usernameToSyntheticEmail(username) {
  const normalized = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  return `${normalized}@login.hardwareerp.local`;
}

export async function supabaseLogin(username, password) {
  if (!supabaseClient) return { data:null, error:new Error('Supabase is not configured') };
  const email = username.includes('@') && username.includes('.') ? username : usernameToSyntheticEmail(username);
  return supabaseClient.auth.signInWithPassword({ email, password });
}
export async function supabaseLogout() { if (supabaseClient) await supabaseClient.auth.signOut(); }

export async function getMyProfile() {
  const { data:{ user }, error:userError } = await supabaseClient.auth.getUser();
  if (userError || !user) throw userError || new Error('Not authenticated');
  const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
  if (error) throw error; if (data.status !== 'active') throw new Error('This account is suspended'); return data;
}
const camelRole = r => r;
const dateOnly = v => v ? String(v).slice(0,10) : null;

export async function loadSupabaseWorkspace(baseState) {
  if (!supabaseClient) return baseState;
  const profile = await getMyProfile();
  const isSuper = profile.role === 'super_admin';
  const { data: shops, error:shopsErr } = await supabaseClient.from('shops').select('*').order('created_at');
  if (shopsErr) throw shopsErr;
  const { data: profiles, error:profilesErr } = await supabaseClient.from('profiles').select('*').order('created_at');
  if (profilesErr) throw profilesErr;

  const state = structuredClone(baseState);
  state.shops = (shops||[]).map(s=>({id:s.id,name:s.name,code:s.code,status:s.status,plan:s.plan,address:s.address||'',phone:s.phone||'',email:s.email||'',brn:s.brn||'',vat:s.vat_no||'',logo:(s.code||s.name).slice(0,2).toUpperCase(),createdAt:s.created_at}));
  state.users = (profiles||[]).map(p=>({id:p.id,tenantId:p.tenant_id||'*',username:p.username,displayName:p.display_name,role:camelRole(p.role),branch:p.branch||'',status:p.status,lastLogin:p.last_login_at,tempPassword:p.must_change_password,password:null}));
  state.session = { userId:profile.id, loginAt:new Date().toISOString(), mode:'supabase' };
  state.currentTenantId = profile.tenant_id || state.currentTenantId;
  if (isSuper && (!state.currentTenantId || !state.shops.some(s=>s.id===state.currentTenantId))) state.currentTenantId = state.shops[0]?.id || null;
  if (state.currentTenantId) await loadTenantDataIntoState(state, state.currentTenantId);
  return state;
}

export async function loadTenantDataIntoState(state, tenantId) {
  if (!tenantId) return state;
  const q = async (table, select='*', order=null) => {
    let req = supabaseClient.from(table).select(select).eq('tenant_id',tenantId);
    if (order) req=req.order(order,{ascending:false});
    const {data,error}=await req; if(error) throw error; return data||[];
  };
  const [products,balances,customers,suppliers,pos,invoices,quotes,orders,grns,returns,counts,payments,deliveries,warranty,expenses,moves,audits,settings] = await Promise.all([
    q('products'), q('stock_balances'), q('customers'), q('suppliers'), q('purchase_orders','*, suppliers(name), purchase_order_items(*, products(name,sku,base_uom))','created_at'),
    q('invoices','*, customers(name,phone), invoice_items(*, products(name,sku,base_uom))','created_at'),
    q('quotations','*, customers(name), quotation_items(*, products(name,sku,base_uom))','quote_date'),
    q('sales_orders','*, customers(name), sales_order_items(*, products(name,sku,base_uom))','created_at'),
    q('grns','*, suppliers(name), grn_items(*, products(name,sku,base_uom))','created_at'),
    q('customer_returns','*, products(name,sku)','created_at'), q('stock_counts','*, products(name,sku,base_uom)','created_at'), q('payments','*, customers(name)','created_at'),
    q('deliveries','*, customers(name)'), q('warranty_claims','*, products(name,sku), customers(name)'), q('expenses','*','created_at'), q('stock_movements','*, products(sku)','created_at'), q('audit_logs','*','created_at'), q('app_settings')
  ]);
  const [supplierPayments,cheques,cashShifts] = await Promise.all([
    q('supplier_payments','*, suppliers(name)','created_at'),
    q('cheques','*, customers(name), suppliers(name)','created_at'),
    q('cash_shifts','*','opened_at')
  ]);
  const balanceById=Object.fromEntries(balances.map(b=>[b.product_id,Number(b.physical_stock||0)]));
  const replaceTenant=(key,rows)=>{state[key]=[...(state[key]||[]).filter(x=>x.tenantId!==tenantId),...rows]};
  replaceTenant('products',products.map(p=>({id:p.id,tenantId:p.tenant_id,sku:p.sku,barcode:p.barcode||'',name:p.name,category:p.category||'General',brand:p.brand||'',model:p.model||'',manufacturer:p.manufacturer||'',country:p.country||'',specification:p.specification||'',aliases:p.aliases||'',imageUrl:p.image_url||'',maxStock:Number(p.max_stock||0),reorderQty:Number(p.reorder_qty||0),baseUom:p.base_uom,purchaseUom:p.purchase_uom,conversion:Number(p.uom_conversion||1),uomOptions:Array.isArray(p.uom_options)?p.uom_options:[],avgCost:Number(p.avg_cost||0),retail:Number(p.retail_price||0),trade:Number(p.trade_price||0),wholesale:Number(p.wholesale_price||0),minPrice:Number(p.minimum_price||0),stock:balanceById[p.id]||0,reserved:Number(p.reserved_qty||0),reorder:Number(p.reorder_level||0),warehouse:p.warehouse||'',rack:p.rack||'',status:p.status,serial:p.serial_controlled,batch:p.batch_controlled})));
  replaceTenant('customers',customers.map(c=>({id:c.id,tenantId:c.tenant_id,code:c.code,name:c.name,type:c.customer_type||'Retail',phone:c.phone||'',email:c.email||'',creditLimit:Number(c.credit_limit||0),creditDays:Number(c.credit_days||0),outstanding:Number(c.outstanding||0),priceGroup:c.price_group||'Retail',status:c.status})));
  replaceTenant('suppliers',suppliers.map(s=>({id:s.id,tenantId:s.tenant_id,code:s.code,name:s.name,phone:s.phone||'',contact:s.contact_person||'',terms:Number(s.credit_days||0),payable:Number(s.payable||0),lastPurchase:null,status:s.status})));
  replaceTenant('purchaseOrders',pos.map(x=>({id:x.po_no,dbId:x.id,tenantId:x.tenant_id,supplier:x.suppliers?.name||'Supplier',date:dateOnly(x.order_date),expected:dateOnly(x.expected_date),total:Number(x.total||0),status:x.status,items:(x.purchase_order_items||[]).length,lines:(x.purchase_order_items||[]).sort((a,b)=>(a.line_no||0)-(b.line_no||0)).map(i=>({productId:i.product_id,sku:i.products?.sku||'',name:i.products?.name||'Item',baseUom:i.products?.base_uom||'',qty:Number(i.quantity||0),cost:Number(i.unit_cost||0),discount:Number(i.discount||0)}))})));
  replaceTenant('sales',invoices.map(x=>({id:x.invoice_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.invoice_date),customer:x.customers?.name||'Walk-in Customer',customerPhone:x.customers?.phone||'',subtotal:Number(x.subtotal||0),discount:Number(x.discount||0),tax:Number(x.tax||0),total:Number(x.total||0),cost:Number(x.cost_total||0),paid:Number(x.paid_amount ?? (x.status==='paid'?x.total:0)),payment:x.payment_method||'Cash',status:x.status,user:'',lines:(x.invoice_items||[]).sort((a,b)=>(a.line_no||0)-(b.line_no||0)).map(i=>({productId:i.product_id,sku:i.products?.sku||'',name:i.products?.name||'Item',qty:Number(i.quantity||0),price:Number(i.unit_price||0),avgCost:Number(i.unit_cost||0),baseUom:i.display_uom||i.products?.base_uom||'',stockUom:i.products?.base_uom||'',factor:Number(i.conversion_factor||1)}))})));
  replaceTenant('quotations',quotes.map(x=>({id:x.quote_no,dbId:x.id,tenantId:x.tenant_id,customer:x.customers?.name||'Customer',customerId:x.customer_id,date:dateOnly(x.quote_date),validity:dateOnly(x.valid_until),amount:Number(x.total||0),status:x.status,lines:(x.quotation_items||[]).sort((a,b)=>a.line_no-b.line_no).map(i=>({productId:i.product_id,sku:i.products?.sku||'',name:i.products?.name||'Item',baseUom:i.products?.base_uom||'',qty:Number(i.quantity||0),price:Number(i.unit_price||0),avgCost:Number(i.unit_cost||0)}))})));
  replaceTenant('salesOrders',orders.map(x=>({id:x.order_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.order_date),quote:x.quote_no||'',customer:x.customers?.name||'Customer',customerId:x.customer_id,total:Number(x.total||0),status:x.status,lines:(x.sales_order_items||[]).sort((a,b)=>a.line_no-b.line_no).map(i=>({productId:i.product_id,sku:i.products?.sku||'',name:i.products?.name||'Item',baseUom:i.products?.base_uom||'',qty:Number(i.quantity||0),price:Number(i.unit_price||0),avgCost:Number(i.unit_cost||0)}))})));
  replaceTenant('grns',grns.flatMap(x=>(x.grn_items||[]).map(i=>({id:x.grn_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.received_date),supplier:x.suppliers?.name||'Supplier',supplierInvoice:x.supplier_invoice_no||'',sku:i.products?.sku||'',product:i.products?.name||'',qty:Number(i.received_qty||0),damaged:Number(i.damaged_qty||0),free:Number(i.free_qty||0),cost:Number(i.unit_cost||0),total:Number(i.received_qty||0)*Number(i.unit_cost||0),batch:i.batch_no||'',expiry:dateOnly(i.expiry_date)}))));
  replaceTenant('returns',returns.map(x=>({id:x.return_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.return_date),invoice:x.invoice_no||'',sku:x.products?.sku||'',name:x.products?.name||'',productId:x.product_id,qty:Number(x.quantity||0),condition:x.condition,reason:x.reason||'',user:''})));
  replaceTenant('stockCounts',counts.map(x=>({id:x.count_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.count_date),sku:x.products?.sku||'',productId:x.product_id,systemQty:Number(x.system_qty||0),countedQty:Number(x.counted_qty||0),variance:Number(x.variance||0),note:x.note||'',user:''})));
  replaceTenant('receipts',payments.filter(x=>!x.invoice_id && String(x.reference||'').startsWith('RC-')).map(x=>({id:String(x.reference||'').split('|')[0],dbId:x.id,tenantId:x.tenant_id,date:x.created_at,customerId:x.customer_id,customer:x.customers?.name||'Customer',amount:Number(x.amount||0),method:x.method,reference:String(x.reference||'').split('|').slice(1).join('|')})));
  replaceTenant('deliveries',deliveries.map(x=>({id:x.delivery_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.created_at),customer:x.customers?.name||'Customer',site:x.site_address||'',vehicle:x.vehicle||'',driver:x.driver||'',status:x.status,packages:Number(x.packages||0),receiver:x.receiver_name||'',podRef:x.pod_reference||'',podNote:x.pod_note||'',deliveredAt:x.delivered_at||null})));
  replaceTenant('warrantyClaims',warranty.map(x=>({id:x.claim_no,dbId:x.id,tenantId:x.tenant_id,serial:x.serial_no,product:x.products?.name||'',customer:x.customers?.name||'',received:dateOnly(x.received_at),status:x.status,note:x.note||''})));
  replaceTenant('expenses',expenses.map(x=>({id:x.expense_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.expense_date),category:x.category,description:x.description||'',amount:Number(x.amount||0),status:x.status})));
  replaceTenant('supplierPayments',supplierPayments.map(x=>({id:x.payment_no,dbId:x.id,tenantId:x.tenant_id,supplierId:x.supplier_id,supplier:x.suppliers?.name||'Supplier',date:x.created_at,amount:Number(x.amount||0),method:x.method,reference:x.reference||''})));
  replaceTenant('cheques',cheques.map(x=>({id:x.record_no,dbId:x.id,tenantId:x.tenant_id,direction:x.direction,chequeNo:x.cheque_no,partyType:x.party_type,partyId:x.customer_id||x.supplier_id,party:x.customers?.name||x.suppliers?.name||'Party',bank:x.bank||'',chequeDate:dateOnly(x.cheque_date),amount:Number(x.amount||0),status:x.status,reference:x.reference||''})));
  replaceTenant('cashShifts',cashShifts.map(x=>({id:x.shift_no,dbId:x.id,tenantId:x.tenant_id,user:x.user_name,userId:null,date:dateOnly(x.opened_at),openingFloat:Number(x.opening_float||0),expectedCash:Number(x.expected_cash||0),actualCash:x.actual_cash===null?null:Number(x.actual_cash),variance:Number(x.variance||0),status:x.status,openedAt:x.opened_at,closedAt:x.closed_at})));
  replaceTenant('stockMovements',moves.map(x=>({id:x.id,tenantId:x.tenant_id,date:dateOnly(x.created_at),sku:x.products?.sku||'',type:x.movement_type,qty:Number(x.quantity||0),ref:x.reference_id||'',warehouse:x.warehouse||'',user:''})));
  replaceTenant('auditLogs',audits.map(x=>({id:x.client_event_id||String(x.id),tenantId:x.tenant_id,at:x.created_at,user:'',action:x.action,entity:x.entity_id||x.entity_type||'',detail:x.detail||''})));
  if(settings[0]) state.settings[tenantId]={...(state.settings[tenantId]||{}),currency:settings[0].currency,vatRate:Number(settings[0].vat_rate),ssclRate:Number(settings[0].sscl_rate),taxRegistered:settings[0].tax_registered,negativeStock:settings[0].allow_negative_stock,discountApproval:Number(settings[0].discount_approval_pct),...(settings[0].settings_json||{})};
  return state;
}

export async function syncTenantToSupabase(state, tenantId) {
  if (!supabaseClient || !tenantId) return;
  const own = key => (state[key]||[]).filter(x=>x.tenantId===tenantId);
  const products=own('products');
  if(products.length){
    const payload=products.map(p=>({tenant_id:tenantId,sku:p.sku,barcode:p.barcode||null,name:p.name,category:p.category||null,brand:p.brand||null,model:p.model||null,manufacturer:p.manufacturer||null,country:p.country||null,specification:p.specification||null,aliases:p.aliases||null,image_url:p.imageUrl||null,max_stock:Number(p.maxStock||0),reorder_qty:Number(p.reorderQty||0),base_uom:p.baseUom||'PCS',purchase_uom:p.purchaseUom||p.baseUom||'PCS',uom_conversion:Number(p.conversion||1),uom_options:Array.isArray(p.uomOptions)?p.uomOptions:[],avg_cost:Number(p.avgCost||0),retail_price:Number(p.retail||0),trade_price:Number(p.trade||0),wholesale_price:Number(p.wholesale||0),minimum_price:Number(p.minPrice||0),reorder_level:Number(p.reorder||0),reserved_qty:Number(p.reserved||0),warehouse:p.warehouse||null,rack:p.rack||null,serial_controlled:!!p.serial,batch_controlled:!!p.batch,status:p.status||'active'}));
    const {error}=await supabaseClient.from('products').upsert(payload,{onConflict:'tenant_id,sku'}); if(error) throw error;
  }
  const customers=own('customers'); if(customers.length){const {error}=await supabaseClient.from('customers').upsert(customers.map(c=>({tenant_id:tenantId,code:c.code,name:c.name,customer_type:c.type||'Retail',phone:c.phone||null,email:c.email||null,credit_limit:Number(c.creditLimit||0),credit_days:Number(c.creditDays||0),outstanding:Number(c.outstanding||0),price_group:c.priceGroup||'Retail',status:c.status||'active'})),{onConflict:'tenant_id,code'});if(error)throw error;}
  const suppliers=own('suppliers'); if(suppliers.length){const {error}=await supabaseClient.from('suppliers').upsert(suppliers.map(s=>({tenant_id:tenantId,code:s.code,name:s.name,phone:s.phone||null,contact_person:s.contact||null,credit_days:Number(s.terms||0),payable:Number(s.payable||0),status:s.status||'active'})),{onConflict:'tenant_id,code'});if(error)throw error;}

  const [{data:dbProducts},{data:dbCustomers},{data:dbSuppliers}] = await Promise.all([
    supabaseClient.from('products').select('id,sku').eq('tenant_id',tenantId),
    supabaseClient.from('customers').select('id,code,name').eq('tenant_id',tenantId),
    supabaseClient.from('suppliers').select('id,code,name').eq('tenant_id',tenantId)
  ]);
  const productBySku=Object.fromEntries((dbProducts||[]).map(x=>[x.sku,x.id]));
  const customerByName=Object.fromEntries((dbCustomers||[]).map(x=>[x.name,x.id]));
  const supplierByName=Object.fromEntries((dbSuppliers||[]).map(x=>[x.name,x.id]));

  const po=own('purchaseOrders'); if(po.length){const {error}=await supabaseClient.from('purchase_orders').upsert(po.map(x=>({tenant_id:tenantId,po_no:x.id,supplier_id:supplierByName[x.supplier]||null,order_date:x.date||new Date().toISOString().slice(0,10),expected_date:x.expected||null,status:x.status||'draft',total:Number(x.total||0)})),{onConflict:'tenant_id,po_no'});if(error)throw error;const {data:dbPOs,error:poerr}=await supabaseClient.from('purchase_orders').select('id,po_no').eq('tenant_id',tenantId);if(poerr)throw poerr;const poByNo=Object.fromEntries((dbPOs||[]).map(x=>[x.po_no,x.id]));const rows=[];for(const o of po){(o.lines||[]).forEach((l,idx)=>{const oid=poByNo[o.id],pid=productBySku[l.sku]||l.productId;if(oid&&pid)rows.push({tenant_id:tenantId,purchase_order_id:oid,line_no:idx+1,product_id:pid,quantity:Number(l.qty||0),unit_cost:Number(l.cost||0),discount:Number(l.discount||0)})})}if(rows.length){const {error}=await supabaseClient.from('purchase_order_items').upsert(rows,{onConflict:'purchase_order_id,line_no'});if(error)throw error;}}
  const sales=own('sales'); if(sales.length){const {error}=await supabaseClient.from('invoices').upsert(sales.map(x=>({tenant_id:tenantId,invoice_no:x.id,invoice_date:x.date,customer_id:customerByName[x.customer]||null,subtotal:Number(x.subtotal??x.total??0),discount:Number(x.discount||0),tax:Number(x.tax||0),total:Number(x.total||0),cost_total:Number(x.cost||0),payment_method:x.payment||'Cash',paid_amount:Number(x.paid||0),status:x.status||'paid'})),{onConflict:'tenant_id,invoice_no'});if(error)throw error;}
  if(sales.length){
    const {data:dbInvoices,error:invErr}=await supabaseClient.from('invoices').select('id,invoice_no').eq('tenant_id',tenantId);if(invErr)throw invErr;
    const invoiceByNo=Object.fromEntries((dbInvoices||[]).map(x=>[x.invoice_no,x.id]));
    const lineRows=[]; for(const inv of sales){(inv.lines||[]).forEach((l,idx)=>{const iid=invoiceByNo[inv.id],pid=productBySku[l.sku]||l.productId;if(iid&&pid)lineRows.push({tenant_id:tenantId,invoice_id:iid,line_no:idx+1,product_id:pid,quantity:Number(l.qty||0),display_uom:l.baseUom||null,conversion_factor:Number(l.factor||1),unit_price:Number(l.price||0),unit_cost:Number(l.avgCost||0),discount:0})})}
    if(lineRows.length){const {error}=await supabaseClient.from('invoice_items').upsert(lineRows,{onConflict:'invoice_id,line_no'});if(error)throw error;}
  }
  const quotes=own('quotations'); if(quotes.length){const {error}=await supabaseClient.from('quotations').upsert(quotes.map(x=>({tenant_id:tenantId,quote_no:x.id,customer_id:customerByName[x.customer]||null,quote_date:x.date,valid_until:x.validity||null,total:Number(x.amount||0),status:x.status||'draft'})),{onConflict:'tenant_id,quote_no'});if(error)throw error;}
  if(quotes.length){const {data:dbQuotes,error:qerr}=await supabaseClient.from('quotations').select('id,quote_no').eq('tenant_id',tenantId);if(qerr)throw qerr;const quoteByNo=Object.fromEntries((dbQuotes||[]).map(x=>[x.quote_no,x.id]));const rows=[];for(const q of quotes){(q.lines||[]).forEach((l,idx)=>{const qid=quoteByNo[q.id],pid=productBySku[l.sku]||l.productId;if(qid&&pid)rows.push({tenant_id:tenantId,quotation_id:qid,line_no:idx+1,product_id:pid,quantity:Number(l.qty||0),unit_price:Number(l.price||0),unit_cost:Number(l.avgCost||0)})})}if(rows.length){const {error}=await supabaseClient.from('quotation_items').upsert(rows,{onConflict:'quotation_id,line_no'});if(error)throw error;}}
  const orders=own('salesOrders'); if(orders.length){const {error}=await supabaseClient.from('sales_orders').upsert(orders.map(x=>({tenant_id:tenantId,order_no:x.id,quote_no:x.quote||null,customer_id:customerByName[x.customer]||x.customerId||null,order_date:x.date||new Date().toISOString().slice(0,10),total:Number(x.total||0),status:x.status||'reserved'})),{onConflict:'tenant_id,order_no'});if(error)throw error;const {data:dbOrders,error:oerr}=await supabaseClient.from('sales_orders').select('id,order_no').eq('tenant_id',tenantId);if(oerr)throw oerr;const orderByNo=Object.fromEntries((dbOrders||[]).map(x=>[x.order_no,x.id]));const rows=[];for(const o of orders){(o.lines||[]).forEach((l,idx)=>{const oid=orderByNo[o.id],pid=productBySku[l.sku]||l.productId;if(oid&&pid)rows.push({tenant_id:tenantId,sales_order_id:oid,line_no:idx+1,product_id:pid,quantity:Number(l.qty||0),unit_price:Number(l.price||0),unit_cost:Number(l.avgCost||0)})})}if(rows.length){const {error}=await supabaseClient.from('sales_order_items').upsert(rows,{onConflict:'sales_order_id,line_no'});if(error)throw error;}}
  const grns=own('grns'); if(grns.length){const unique=[...new Map(grns.map(g=>[g.id,g])).values()];const {error}=await supabaseClient.from('grns').upsert(unique.map(g=>({tenant_id:tenantId,grn_no:g.id,supplier_id:supplierByName[g.supplier]||null,supplier_invoice_no:g.supplierInvoice||null,received_date:g.date||new Date().toISOString().slice(0,10),status:'received'})),{onConflict:'tenant_id,grn_no'});if(error)throw error;const {data:dbGrns,error:gerr}=await supabaseClient.from('grns').select('id,grn_no').eq('tenant_id',tenantId);if(gerr)throw gerr;const grnByNo=Object.fromEntries((dbGrns||[]).map(x=>[x.grn_no,x.id]));const rows=[];const seq={};for(const g of grns){const gid=grnByNo[g.id],pid=productBySku[g.sku];if(gid&&pid){seq[g.id]=(seq[g.id]||0)+1;rows.push({tenant_id:tenantId,grn_id:gid,line_no:seq[g.id],product_id:pid,received_qty:Number(g.qty||0),damaged_qty:Number(g.damaged||0),free_qty:Number(g.free||0),unit_cost:Number(g.cost||0),batch_no:g.batch||null,expiry_date:g.expiry||null})}}if(rows.length){const {error}=await supabaseClient.from('grn_items').upsert(rows,{onConflict:'grn_id,line_no'});if(error)throw error;}}
  const returns=own('returns'); if(returns.length){const {error}=await supabaseClient.from('customer_returns').upsert(returns.map(r=>({tenant_id:tenantId,return_no:r.id,invoice_no:r.invoice||null,product_id:productBySku[r.sku]||r.productId||null,quantity:Number(r.qty||0),condition:r.condition||'Resellable',reason:r.reason||null,return_date:r.date||new Date().toISOString().slice(0,10)})),{onConflict:'tenant_id,return_no'});if(error)throw error;}
  const counts=own('stockCounts'); if(counts.length){const {error}=await supabaseClient.from('stock_counts').upsert(counts.map(c=>({tenant_id:tenantId,count_no:c.id,product_id:productBySku[c.sku]||c.productId,system_qty:Number(c.systemQty||0),counted_qty:Number(c.countedQty||0),variance:Number(c.variance||0),note:c.note||null,count_date:c.date||new Date().toISOString().slice(0,10)})),{onConflict:'tenant_id,count_no'});if(error)throw error;}
  const receipts=own('receipts'); if(receipts.length){const refs=receipts.map(r=>r.id);let existing=[];const {data}=await supabaseClient.from('payments').select('reference').eq('tenant_id',tenantId).is('invoice_id',null);existing=(data||[]).map(x=>String(x.reference||'').split('|')[0]);const missing=receipts.filter(r=>!existing.includes(r.id));if(missing.length){const {error}=await supabaseClient.from('payments').insert(missing.map(r=>({tenant_id:tenantId,customer_id:r.customerId||customerByName[r.customer]||null,invoice_id:null,amount:Number(r.amount||0),method:r.method||'Cash',reference:`${r.id}|${r.reference||''}`})));if(error)throw error;}}
  const deliveries=own('deliveries'); if(deliveries.length){const {error}=await supabaseClient.from('deliveries').upsert(deliveries.map(x=>({tenant_id:tenantId,delivery_no:x.id,customer_id:customerByName[x.customer]||null,site_address:x.site||null,vehicle:x.vehicle||null,driver:x.driver||null,packages:Number(x.packages||0),status:x.status||'ready',receiver_name:x.receiver||null,pod_reference:x.podRef||null,pod_note:x.podNote||null,delivered_at:x.deliveredAt||null})),{onConflict:'tenant_id,delivery_no'});if(error)throw error;}
  const warranty=own('warrantyClaims'); if(warranty.length){const byName=Object.fromEntries(products.map(x=>[x.name,productBySku[x.sku]]));const {error}=await supabaseClient.from('warranty_claims').upsert(warranty.map(x=>({tenant_id:tenantId,claim_no:x.id,product_id:byName[x.product]||null,serial_no:x.serial,customer_id:customerByName[x.customer]||null,received_at:x.received?`${x.received}T00:00:00Z`:new Date().toISOString(),status:x.status||'received',note:x.note||null})),{onConflict:'tenant_id,claim_no'});if(error)throw error;}
  const supplierPayments=own('supplierPayments'); if(supplierPayments.length){const {error}=await supabaseClient.from('supplier_payments').upsert(supplierPayments.map(x=>({tenant_id:tenantId,payment_no:x.id,supplier_id:x.supplierId||supplierByName[x.supplier]||null,payment_date:String(x.date||new Date().toISOString()).slice(0,10),amount:Number(x.amount||0),method:x.method||'Bank',reference:x.reference||null})),{onConflict:'tenant_id,payment_no'});if(error)throw error;}
  const cheques=own('cheques'); if(cheques.length){const {error}=await supabaseClient.from('cheques').upsert(cheques.map(x=>({tenant_id:tenantId,record_no:x.id,direction:x.direction||'received',cheque_no:x.chequeNo,party_type:x.partyType||'customer',customer_id:x.partyType==='customer'?(x.partyId||customerByName[x.party]||null):null,supplier_id:x.partyType==='supplier'?(x.partyId||supplierByName[x.party]||null):null,bank:x.bank||null,cheque_date:x.chequeDate||null,amount:Number(x.amount||0),status:x.status||'in_hand',reference:x.reference||null})),{onConflict:'tenant_id,record_no'});if(error)throw error;}
  const cashShifts=own('cashShifts'); if(cashShifts.length){const {error}=await supabaseClient.from('cash_shifts').upsert(cashShifts.map(x=>({tenant_id:tenantId,shift_no:x.id,user_name:x.user||'',opening_float:Number(x.openingFloat||0),expected_cash:Number(x.expectedCash||0),actual_cash:x.actualCash===null?null:Number(x.actualCash||0),variance:Number(x.variance||0),status:x.status||'open',opened_at:x.openedAt||new Date().toISOString(),closed_at:x.closedAt||null})),{onConflict:'tenant_id,shift_no'});if(error)throw error;}
  const expenses=own('expenses'); if(expenses.length){const {error}=await supabaseClient.from('expenses').upsert(expenses.map(x=>({tenant_id:tenantId,expense_no:x.id,expense_date:x.date,category:x.category,description:x.description||null,amount:Number(x.amount||0),status:x.status||'approved'})),{onConflict:'tenant_id,expense_no'});if(error)throw error;}

  // Movements are append-only and deduplicated by reference+SKU+qty in this trial adapter.
  const moves=own('stockMovements').filter(x=>productBySku[x.sku]);
  if(moves.length){
    const refs=[...new Set(moves.map(x=>x.ref).filter(Boolean))];
    let existing=[]; if(refs.length){const {data}=await supabaseClient.from('stock_movements').select('product_id,quantity,reference_id,movement_type,warehouse').eq('tenant_id',tenantId).in('reference_id',refs);existing=data||[];}
    const missing=moves.filter(m=>!existing.some(e=>e.product_id===productBySku[m.sku]&&Number(e.quantity)===Number(m.qty)&&e.reference_id===m.ref&&e.movement_type===m.type&&(e.warehouse||'')===(m.warehouse||'')));
    if(missing.length){const {error}=await supabaseClient.from('stock_movements').insert(missing.map(m=>({tenant_id:tenantId,product_id:productBySku[m.sku],movement_type:m.type,quantity:Number(m.qty),reference_type:m.type,reference_id:m.ref||`EVT-${m.id}`,warehouse:m.warehouse||null,reason:null})));if(error)throw error;}
  }
  const audits=own('auditLogs').filter(a=>a.id); if(audits.length){const {error}=await supabaseClient.from('audit_logs').upsert(audits.map(a=>({tenant_id:tenantId,action:a.action,entity_type:'app',entity_id:String(a.entity||''),detail:a.detail||null,client_event_id:String(a.id)})),{onConflict:'tenant_id,client_event_id',ignoreDuplicates:true});if(error)throw error;}
  const st=state.settings?.[tenantId]; if(st){const {error}=await supabaseClient.from('app_settings').upsert({tenant_id:tenantId,currency:st.currency||'LKR',vat_rate:Number(st.vatRate||0),sscl_rate:Number(st.ssclRate||0),tax_registered:!!st.taxRegistered,allow_negative_stock:!!st.negativeStock,discount_approval_pct:Number(st.discountApproval||10),settings_json:{theme:st.theme||'dark',posPaper:String(st.posPaper||'80'),invoiceFooter:st.invoiceFooter||'',invoiceTerms:st.invoiceTerms||'',documentBusinessName:st.documentBusinessName||'',documentAddress:st.documentAddress||'',documentPhone:st.documentPhone||'',documentEmail:st.documentEmail||'',documentBRN:st.documentBRN||'',documentVAT:st.documentVAT||'',barcodeDefaultSize:st.barcodeDefaultSize||'50x25'}},{onConflict:'tenant_id'});if(error)throw error;}
}


export async function postSupabaseSale({tenantId,invoiceNo,customerId,subtotal,discount,tax,total,cost,paid,paymentMethod,lines}) {
  if (!supabaseClient) throw new Error('Supabase is not configured');
  const items=(lines||[]).map(l=>({product_id:l.productId,quantity:Number(l.qty),display_uom:l.baseUom||null,conversion_factor:Number(l.factor||1),unit_price:Number(l.price),unit_cost:Number(l.avgCost||0)}));
  const {data,error}=await supabaseClient.rpc('post_sale_v2',{p_tenant_id:tenantId,p_invoice_no:invoiceNo,p_customer_id:customerId,p_subtotal:Number(subtotal||0),p_discount:Number(discount||0),p_tax:Number(tax||0),p_total:Number(total||0),p_cost_total:Number(cost||0),p_paid_amount:Number(paid||0),p_payment_method:paymentMethod||'Cash',p_items:items});
  if(error) throw error; return data;
}

export async function postWarehouseTransfer({productId,qty,fromWarehouse,toWarehouse,reference,note=''}) {
  if (!supabaseClient) throw new Error('Supabase is not configured');
  const {data,error}=await supabaseClient.rpc('post_warehouse_transfer',{
    p_product_id:productId,p_qty:Number(qty),p_from_warehouse:fromWarehouse,p_to_warehouse:toWarehouse,
    p_reference:reference||null,p_note:note||null
  });
  if(error) throw error;
  return data;
}

export async function createSupabaseShop(shop, admin) {
  const {data:newShop,error}=await supabaseClient.from('shops').insert({name:shop.name,code:shop.code,status:'active',plan:'Trial',address:shop.address||null,phone:shop.phone||null}).select().single();
  if(error) throw error;
  await supabaseClient.from('app_settings').insert({tenant_id:newShop.id,currency:'LKR',vat_rate:18,sscl_rate:2.5,tax_registered:false,allow_negative_stock:false,discount_approval_pct:10});
  const created=await callAdminUsers('create',{tenantId:newShop.id,username:admin.username,password:admin.password,displayName:admin.displayName||`${shop.name} Admin`,role:'shop_admin',branch:'Main Branch'});
  return {shop:newShop,admin:created};
}

export async function callAdminUsers(action, payload={}) {
  const { data, error } = await supabaseClient.functions.invoke('admin-users', { body:{ action, ...payload } });
  if (error) throw error; if(data?.ok===false) throw new Error(data.error||'Admin operation failed'); return data;
}
