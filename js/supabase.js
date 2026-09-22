const cfg = window.HARDWARE_ERP_CONFIG || {};
export const isSupabaseConfigured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && window.supabase);
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
  const [products,balances,customers,suppliers,pos,invoices,quotes,deliveries,warranty,expenses,moves,audits,settings] = await Promise.all([
    q('products'), q('stock_balances'), q('customers'), q('suppliers'), q('purchase_orders','*, suppliers(name)','created_at'), q('invoices','*, customers(name)','created_at'), q('quotations','*, customers(name)'), q('deliveries','*, customers(name)'), q('warranty_claims','*, products(name,sku), customers(name)'), q('expenses','*','created_at'), q('stock_movements','*, products(sku)','created_at'), q('audit_logs','*','created_at'), q('app_settings')
  ]);
  const balanceById=Object.fromEntries(balances.map(b=>[b.product_id,Number(b.physical_stock||0)]));
  const replaceTenant=(key,rows)=>{state[key]=[...(state[key]||[]).filter(x=>x.tenantId!==tenantId),...rows]};
  replaceTenant('products',products.map(p=>({id:p.id,tenantId:p.tenant_id,sku:p.sku,barcode:p.barcode||'',name:p.name,category:p.category||'General',brand:p.brand||'',baseUom:p.base_uom,purchaseUom:p.purchase_uom,conversion:Number(p.uom_conversion||1),avgCost:Number(p.avg_cost||0),retail:Number(p.retail_price||0),trade:Number(p.trade_price||0),wholesale:Number(p.wholesale_price||0),minPrice:Number(p.minimum_price||0),stock:balanceById[p.id]||0,reserved:Number(p.reserved_qty||0),reorder:Number(p.reorder_level||0),warehouse:p.warehouse||'',rack:p.rack||'',status:p.status,serial:p.serial_controlled,batch:p.batch_controlled})));
  replaceTenant('customers',customers.map(c=>({id:c.id,tenantId:c.tenant_id,code:c.code,name:c.name,type:c.customer_type||'Retail',phone:c.phone||'',email:c.email||'',creditLimit:Number(c.credit_limit||0),creditDays:Number(c.credit_days||0),outstanding:Number(c.outstanding||0),priceGroup:c.price_group||'Retail',status:c.status})));
  replaceTenant('suppliers',suppliers.map(s=>({id:s.id,tenantId:s.tenant_id,code:s.code,name:s.name,phone:s.phone||'',contact:s.contact_person||'',terms:Number(s.credit_days||0),payable:Number(s.payable||0),lastPurchase:null,status:s.status})));
  replaceTenant('purchaseOrders',pos.map(x=>({id:x.po_no,dbId:x.id,tenantId:x.tenant_id,supplier:x.suppliers?.name||'Supplier',date:dateOnly(x.order_date),expected:dateOnly(x.expected_date),total:Number(x.total||0),status:x.status,items:0})));
  replaceTenant('sales',invoices.map(x=>({id:x.invoice_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.invoice_date),customer:x.customers?.name||'Walk-in Customer',total:Number(x.total||0),cost:Number(x.cost_total||0),payment:x.payment_method||'Cash',status:x.status,user:''})));
  replaceTenant('quotations',quotes.map(x=>({id:x.quote_no,dbId:x.id,tenantId:x.tenant_id,customer:x.customers?.name||'Customer',date:dateOnly(x.quote_date),validity:dateOnly(x.valid_until),amount:Number(x.total||0),status:x.status})));
  replaceTenant('deliveries',deliveries.map(x=>({id:x.delivery_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.created_at),customer:x.customers?.name||'Customer',site:x.site_address||'',vehicle:x.vehicle||'',driver:x.driver||'',status:x.status,packages:0})));
  replaceTenant('warrantyClaims',warranty.map(x=>({id:x.claim_no,dbId:x.id,tenantId:x.tenant_id,serial:x.serial_no,product:x.products?.name||'',customer:x.customers?.name||'',received:dateOnly(x.received_at),status:x.status,note:x.note||''})));
  replaceTenant('expenses',expenses.map(x=>({id:x.expense_no,dbId:x.id,tenantId:x.tenant_id,date:dateOnly(x.expense_date),category:x.category,description:x.description||'',amount:Number(x.amount||0),status:x.status})));
  replaceTenant('stockMovements',moves.map(x=>({id:x.id,tenantId:x.tenant_id,date:dateOnly(x.created_at),sku:x.products?.sku||'',type:x.movement_type,qty:Number(x.quantity||0),ref:x.reference_id||'',user:''})));
  replaceTenant('auditLogs',audits.map(x=>({id:x.client_event_id||String(x.id),tenantId:x.tenant_id,at:x.created_at,user:'',action:x.action,entity:x.entity_id||x.entity_type||'',detail:x.detail||''})));
  if(settings[0]) state.settings[tenantId]={currency:settings[0].currency,vatRate:Number(settings[0].vat_rate),ssclRate:Number(settings[0].sscl_rate),taxRegistered:settings[0].tax_registered,negativeStock:settings[0].allow_negative_stock,discountApproval:Number(settings[0].discount_approval_pct)};
  return state;
}

export async function syncTenantToSupabase(state, tenantId) {
  if (!supabaseClient || !tenantId) return;
  const own = key => (state[key]||[]).filter(x=>x.tenantId===tenantId);
  const products=own('products');
  if(products.length){
    const payload=products.map(p=>({tenant_id:tenantId,sku:p.sku,barcode:p.barcode||null,name:p.name,category:p.category||null,brand:p.brand||null,base_uom:p.baseUom||'PCS',purchase_uom:p.purchaseUom||p.baseUom||'PCS',uom_conversion:Number(p.conversion||1),avg_cost:Number(p.avgCost||0),retail_price:Number(p.retail||0),trade_price:Number(p.trade||0),wholesale_price:Number(p.wholesale||0),minimum_price:Number(p.minPrice||0),reorder_level:Number(p.reorder||0),reserved_qty:Number(p.reserved||0),warehouse:p.warehouse||null,rack:p.rack||null,serial_controlled:!!p.serial,batch_controlled:!!p.batch,status:p.status||'active'}));
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

  const po=own('purchaseOrders'); if(po.length){const {error}=await supabaseClient.from('purchase_orders').upsert(po.map(x=>({tenant_id:tenantId,po_no:x.id,supplier_id:supplierByName[x.supplier]||null,order_date:x.date||new Date().toISOString().slice(0,10),expected_date:x.expected||null,status:x.status||'draft',total:Number(x.total||0)})),{onConflict:'tenant_id,po_no'});if(error)throw error;}
  const sales=own('sales'); if(sales.length){const {error}=await supabaseClient.from('invoices').upsert(sales.map(x=>({tenant_id:tenantId,invoice_no:x.id,invoice_date:x.date,customer_id:customerByName[x.customer]||null,subtotal:Number(x.total||0),total:Number(x.total||0),cost_total:Number(x.cost||0),payment_method:x.payment||'Cash',status:x.status||'paid'})),{onConflict:'tenant_id,invoice_no'});if(error)throw error;}
  const quotes=own('quotations'); if(quotes.length){const {error}=await supabaseClient.from('quotations').upsert(quotes.map(x=>({tenant_id:tenantId,quote_no:x.id,customer_id:customerByName[x.customer]||null,quote_date:x.date,valid_until:x.validity||null,total:Number(x.amount||0),status:x.status||'draft'})),{onConflict:'tenant_id,quote_no'});if(error)throw error;}
  const deliveries=own('deliveries'); if(deliveries.length){const {error}=await supabaseClient.from('deliveries').upsert(deliveries.map(x=>({tenant_id:tenantId,delivery_no:x.id,customer_id:customerByName[x.customer]||null,site_address:x.site||null,vehicle:x.vehicle||null,driver:x.driver||null,status:x.status||'ready'})),{onConflict:'tenant_id,delivery_no'});if(error)throw error;}
  const warranty=own('warrantyClaims'); if(warranty.length){const byName=Object.fromEntries(products.map(x=>[x.name,productBySku[x.sku]]));const {error}=await supabaseClient.from('warranty_claims').upsert(warranty.map(x=>({tenant_id:tenantId,claim_no:x.id,product_id:byName[x.product]||null,serial_no:x.serial,customer_id:customerByName[x.customer]||null,received_at:x.received?`${x.received}T00:00:00Z`:new Date().toISOString(),status:x.status||'received',note:x.note||null})),{onConflict:'tenant_id,claim_no'});if(error)throw error;}
  const expenses=own('expenses'); if(expenses.length){const {error}=await supabaseClient.from('expenses').upsert(expenses.map(x=>({tenant_id:tenantId,expense_no:x.id,expense_date:x.date,category:x.category,description:x.description||null,amount:Number(x.amount||0),status:x.status||'approved'})),{onConflict:'tenant_id,expense_no'});if(error)throw error;}

  // Movements are append-only and deduplicated by reference+SKU+qty in this trial adapter.
  const moves=own('stockMovements').filter(x=>productBySku[x.sku]);
  if(moves.length){
    const refs=[...new Set(moves.map(x=>x.ref).filter(Boolean))];
    let existing=[]; if(refs.length){const {data}=await supabaseClient.from('stock_movements').select('product_id,quantity,reference_id,movement_type').eq('tenant_id',tenantId).in('reference_id',refs);existing=data||[];}
    const missing=moves.filter(m=>!existing.some(e=>e.product_id===productBySku[m.sku]&&Number(e.quantity)===Number(m.qty)&&e.reference_id===m.ref&&e.movement_type===m.type));
    if(missing.length){const {error}=await supabaseClient.from('stock_movements').insert(missing.map(m=>({tenant_id:tenantId,product_id:productBySku[m.sku],movement_type:m.type,quantity:Number(m.qty),reference_type:m.type,reference_id:m.ref||`EVT-${m.id}`,reason:null})));if(error)throw error;}
  }
  const audits=own('auditLogs').filter(a=>a.id); if(audits.length){const {error}=await supabaseClient.from('audit_logs').upsert(audits.map(a=>({tenant_id:tenantId,action:a.action,entity_type:'app',entity_id:String(a.entity||''),detail:a.detail||null,client_event_id:String(a.id)})),{onConflict:'tenant_id,client_event_id',ignoreDuplicates:true});if(error)throw error;}
  const st=state.settings?.[tenantId]; if(st){const {error}=await supabaseClient.from('app_settings').upsert({tenant_id:tenantId,currency:st.currency||'LKR',vat_rate:Number(st.vatRate||0),sscl_rate:Number(st.ssclRate||0),tax_registered:!!st.taxRegistered,allow_negative_stock:!!st.negativeStock,discount_approval_pct:Number(st.discountApproval||10)},{onConflict:'tenant_id'});if(error)throw error;}
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
