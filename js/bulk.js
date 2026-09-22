export const bulkDefinitions = {
  products: {
    label:'New / Update Products', key:'sku', collection:'products',
    columns:['SKU*','Barcode','Item Name*','Category','Brand','Model','Manufacturer','Country','Aliases','Specification','Base UOM','Purchase UOM','Conversion','Avg Cost','Retail Price','Trade Price','Wholesale Price','Minimum Price','Opening Stock','Reorder Level','Max Stock','Reorder Qty','Warehouse','Rack'],
    map:{'SKU*':'sku','Barcode':'barcode','Item Name*':'name','Category':'category','Brand':'brand','Model':'model','Manufacturer':'manufacturer','Country':'country','Aliases':'aliases','Specification':'specification','Base UOM':'baseUom','Purchase UOM':'purchaseUom','Conversion':'conversion','Avg Cost':'avgCost','Retail Price':'retail','Trade Price':'trade','Wholesale Price':'wholesale','Minimum Price':'minPrice','Opening Stock':'stock','Reorder Level':'reorder','Max Stock':'maxStock','Reorder Qty':'reorderQty','Warehouse':'warehouse','Rack':'rack'}
  },
  prices: {
    label:'Selling Price Update', key:'sku', collection:'products',
    columns:['SKU*','Item Name','Retail Price*','Trade Price','Wholesale Price','Minimum Price'],
    map:{'SKU*':'sku','Item Name':'name','Retail Price*':'retail','Trade Price':'trade','Wholesale Price':'wholesale','Minimum Price':'minPrice'}
  },
  stock: {
    label:'Stock Adjustment', key:'sku', collection:'products',
    columns:['SKU*','Item Name','Warehouse','Adjustment Qty*','Reason*'],
    map:{'SKU*':'sku','Item Name':'name','Warehouse':'warehouse','Adjustment Qty*':'adjustmentQty','Reason*':'reason'}
  },
  opening: {
    label:'Opening Stock', key:'sku', collection:'products',
    columns:['SKU*','Item Name','Warehouse','Opening Stock*','Rack'],
    map:{'SKU*':'sku','Item Name':'name','Warehouse':'warehouse','Opening Stock*':'openingStock','Rack':'rack'}
  },
  customers: {
    label:'Customers', key:'code', collection:'customers',
    columns:['Customer Code*','Customer Name*','Type','Phone','Email','Credit Limit','Credit Days','Price Group'],
    map:{'Customer Code*':'code','Customer Name*':'name','Type':'type','Phone':'phone','Email':'email','Credit Limit':'creditLimit','Credit Days':'creditDays','Price Group':'priceGroup'}
  },
  suppliers: {
    label:'Suppliers', key:'code', collection:'suppliers',
    columns:['Supplier Code*','Supplier Name*','Phone','Contact Person','Credit Days'],
    map:{'Supplier Code*':'code','Supplier Name*':'name','Phone':'phone','Contact Person':'contact','Credit Days':'terms'}
  }
};

const cleanHeader = h => String(h || '').trim().toLowerCase().replace(/[\s_*./()-]+/g,'');
const aliases = {
  sku:['sku','itemcode','productcode','code'], barcode:['barcode','ean'], name:['itemname','productname','name','customername','suppliername'],
  category:['category'], brand:['brand'], model:['model'], manufacturer:['manufacturer','maker'], country:['country','origin'], aliases:['aliases','alias','searchaliases'], specification:['specification','spec','description'], maxStock:['maxstock'], reorderQty:['reorderqty','reorderquantity'], baseUom:['baseuom','uom','unit'], purchaseUom:['purchaseuom','purchaseunit'], conversion:['conversion','unitconversion'],
  avgCost:['avgcost','cost','averagecost'], retail:['retailprice','sellingprice','retail'], trade:['tradeprice','trade'], wholesale:['wholesaleprice','wholesale'], minPrice:['minimumprice','minprice'],
  stock:['openingstock','stock'], reorder:['reorderlevel','reorder'], warehouse:['warehouse','location'], rack:['rack','bin','rackbin'], adjustmentQty:['adjustmentqty','qty','quantity','adjustment'],
  reason:['reason','adjustmentreason'], openingStock:['openingstock','stockqty'], code:['customercode','suppliercode','code'], type:['type','customertype'], phone:['phone','mobile','contactno'],
  email:['email'], creditLimit:['creditlimit'], creditDays:['creditdays','terms'], priceGroup:['pricegroup','pricinggroup'], contact:['contactperson','contact']
};

export function parseClipboard(text, definition) {
  const rows = String(text || '').trim().split(/\r?\n/).filter(Boolean).map(r => r.split('\t'));
  if (!rows.length) return { headers:[], items:[] };
  const first = rows[0].map(x => x.trim());
  const recognized = first.some(h => Object.values(definition.map).some(field => aliases[field]?.includes(cleanHeader(h)) || cleanHeader(h) === cleanHeader(field)));
  const headers = recognized ? first : definition.columns;
  const body = recognized ? rows.slice(1) : rows;
  const fieldByIndex = headers.map(h => {
    const exact = Object.entries(definition.map).find(([label]) => cleanHeader(label) === cleanHeader(h));
    if (exact) return exact[1];
    return Object.keys(aliases).find(field => aliases[field].includes(cleanHeader(h))) || null;
  });
  const items = body.map((cells, idx) => {
    const obj = { __row: idx + (recognized ? 2 : 1) };
    fieldByIndex.forEach((field,i) => { if (field) obj[field] = String(cells[i] ?? '').trim(); });
    return obj;
  });
  return { headers, items };
}

export function validateRows(items, type, state, tenantId) {
  const def = bulkDefinitions[type];
  const current = (state[def.collection] || []).filter(x => x.tenantId === tenantId);
  const seen = new Set();
  return items.map(raw => {
    const row = {...raw};
    const errors = [];
    const warnings = [];
    const required = type === 'products' ? ['sku','name'] : type === 'prices' ? ['sku','retail'] : type === 'stock' ? ['sku','adjustmentQty','reason'] : type === 'opening' ? ['sku','openingStock'] : type === 'customers' ? ['code','name'] : ['code','name'];
    required.forEach(k => { if (row[k] === undefined || row[k] === '') errors.push(`${k} is required`); });
    const key = row[def.key];
    if (key) {
      if (seen.has(key)) errors.push('Duplicate key in pasted data');
      seen.add(key);
    }
    const existing = current.find(x => String(x[def.key]).toLowerCase() === String(key).toLowerCase());
    if (['prices','stock','opening'].includes(type) && !existing) errors.push('Item not found');
    if (type === 'products' && existing) warnings.push('Existing item will be updated');
    if (['retail','trade','wholesale','minPrice','avgCost','stock','reorder','maxStock','reorderQty','conversion','adjustmentQty','openingStock','creditLimit','creditDays','terms'].some(k => row[k] !== undefined && row[k] !== '' && Number.isNaN(Number(row[k])))) {
      errors.push('One or more numeric values are invalid');
    }
    if (type === 'prices' && existing && row.retail !== '' && Number(row.retail) < Number(existing.avgCost || 0)) warnings.push('Retail price is below average cost');
    return { ...row, __existing: existing || null, __errors:errors, __warnings:warnings, __valid:errors.length===0 };
  });
}

export function applyRows(rows, type, state, tenantId, userName) {
  const def = bulkDefinitions[type];
  const collection = state[def.collection];
  let changed = 0;
  rows.filter(r => r.__valid).forEach(row => {
    const existing = collection.find(x => x.tenantId === tenantId && String(x[def.key]).toLowerCase() === String(row[def.key]).toLowerCase());
    const convert = obj => {
      const out = {};
      Object.keys(obj).forEach(k => {
        if (k.startsWith('__')) return;
        if (['conversion','avgCost','retail','trade','wholesale','minPrice','stock','reorder','maxStock','reorderQty','adjustmentQty','openingStock','creditLimit','creditDays','terms'].includes(k)) out[k] = obj[k] === '' ? 0 : Number(obj[k]);
        else out[k] = obj[k];
      });
      return out;
    };
    const clean = convert(row);
    if (type === 'stock' && existing) {
      const before = Number(existing.stock || 0); const qty = Number(clean.adjustmentQty || 0);
      existing.stock = before + qty;
      state.stockMovements.unshift({ id:`SM-${Date.now()}-${changed}`, tenantId, date:new Date().toISOString().slice(0,10), sku:existing.sku, type:'Bulk Adjustment', qty, ref:`BULK-${Date.now()}`, warehouse:clean.warehouse||existing.warehouse||'Main Warehouse', user:userName });
    } else if (type === 'opening' && existing) {
      const before = Number(existing.stock || 0); const after = Number(clean.openingStock || 0);
      existing.stock = after;
      if (clean.warehouse) existing.warehouse = clean.warehouse;
      if (clean.rack) existing.rack = clean.rack;
      state.stockMovements.unshift({ id:`SM-${Date.now()}-${changed}`, tenantId, date:new Date().toISOString().slice(0,10), sku:existing.sku, type:'Opening Balance', qty:after-before, ref:`OPEN-${Date.now()}`, warehouse:clean.warehouse||existing.warehouse||'Main Warehouse', user:userName });
    } else if (existing) {
      if (type === 'products' && clean.stock !== undefined && clean.stock !== '') {
        const before = Number(existing.stock || 0); const after = Number(clean.stock || 0); const delta = after - before;
        if (delta) state.stockMovements.unshift({ id:`SM-${Date.now()}-${changed}`, tenantId, date:new Date().toISOString().slice(0,10), sku:existing.sku, type:'Bulk Opening/Correction', qty:delta, ref:`BULK-${Date.now()}`, warehouse:clean.warehouse||existing.warehouse||'Main Warehouse', user:userName });
      }
      Object.assign(existing, clean);
    } else {
      const created = { id:`${def.collection.slice(0,1)}-${Date.now()}-${changed}`, tenantId, status:'active', outstanding:0, payable:0, ...clean };
      collection.unshift(created);
      if (type === 'products' && Number(clean.stock || 0)) state.stockMovements.unshift({ id:`SM-${Date.now()}-${changed}`, tenantId, date:new Date().toISOString().slice(0,10), sku:clean.sku, type:'Opening Balance', qty:Number(clean.stock), ref:`OPEN-${Date.now()}`, warehouse:clean.warehouse||'Main Warehouse', user:userName });
    }
    changed++;
  });
  state.auditLogs.unshift({ id:`AL-${Date.now()}`, tenantId, at:new Date().toISOString(), user:userName, action:'BULK_IMPORT', entity:def.label, detail:`${changed} valid row(s) imported/updated` });
  return changed;
}

export function downloadTemplate(type) {
  const def = bulkDefinitions[type];
  const sample = def.columns.map(c => {
    const k = def.map[c];
    const samples = {sku:'HWD-0001',barcode:'479000000001',name:'Sample Hardware Item',category:'Electrical',brand:'Brand',model:'Model X',manufacturer:'Manufacturer',country:'Sri Lanka',aliases:'sample,item',specification:'Sample specification',maxStock:100,reorderQty:25,baseUom:'PCS',purchaseUom:'BOX',conversion:10,avgCost:100,retail:150,trade:140,wholesale:130,minPrice:120,stock:50,reorder:10,warehouse:'Main Warehouse',rack:'A01-B02',adjustmentQty:5,reason:'Count correction',openingStock:50,code:type==='customers'?'CUS-0001':'SUP-0001',type:'Contractor',phone:'0771234567',email:'name@example.com',creditLimit:100000,creditDays:30,priceGroup:'Trade',contact:'Contact Person',terms:30};
    return samples[k] ?? '';
  });
  if (window.XLSX) {
    const ws = XLSX.utils.aoa_to_sheet([def.columns, sample]);
    ws['!cols'] = def.columns.map(c => ({wch:Math.max(14,c.length+3)}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `HardwareERP_${type}_template.xlsx`);
  } else {
    const csv = [def.columns,sample].map(r => r.map(x => `"${String(x).replaceAll('"','""')}"`).join(',')).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download=`HardwareERP_${type}_template.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
}
