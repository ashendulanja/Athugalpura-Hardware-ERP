const STORAGE_KEY = 'hardware_erp_demo_v1';

const now = () => new Date().toISOString();
const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

export const permissionsByRole = {
  super_admin: ['*'],
  shop_admin: ['dashboard','sales','invoices','quotations','orders','barcode','products','inventory','purchasing','customers','suppliers','delivery','warranty','finance','reports','bulk','users','settings','approvals'],
  manager: ['dashboard','sales','invoices','quotations','orders','barcode','products','inventory','purchasing','customers','suppliers','delivery','warranty','reports','approvals'],
  cashier: ['dashboard','sales','invoices','quotations','barcode','products','customers'],
  sales: ['dashboard','sales','invoices','quotations','orders','barcode','products','customers','reports'],
  stores: ['dashboard','barcode','products','inventory','purchasing','delivery'],
  accounts: ['dashboard','customers','suppliers','finance','reports'],
  delivery: ['dashboard','delivery'],
  auditor: ['dashboard','invoices','products','inventory','purchasing','customers','suppliers','delivery','warranty','finance','reports']
};

function seed() {
  return {
    meta: { version: 1, createdAt: now(), lastSavedAt: now() },
    session: null,
    currentTenantId: 'tenant-demo',
    supportSession: null,
    shops: [
      { id:'tenant-demo', name:'Cityline Hardware', code:'CLH', status:'active', plan:'Trial', address:'No. 18, Main Street, Kurunegala', phone:'037 222 4588', email:'hello@cityline.demo', brn:'PV-00981234', vat:'', logo:'CH', createdAt:now() },
      { id:'tenant-north', name:'Northway Builders Mart', code:'NBM', status:'active', plan:'Trial', address:'Kandy Road, Matale', phone:'066 223 1188', email:'admin@northway.demo', brn:'PV-00177642', vat:'', logo:'NB', createdAt:now() }
    ],
    users: [
      { id:'usr-super', tenantId:'*', username:'Admin@123', displayName:'System Super Admin', role:'super_admin', branch:'All Shops', status:'active', lastLogin:now(), tempPassword:false, password:'Admin@123#' },
      { id:'usr-1', tenantId:'tenant-demo', username:'nimesh', displayName:'Nimesh Perera', role:'shop_admin', branch:'Main Branch', status:'active', lastLogin:now(), tempPassword:false, password:'Demo@123#' },
      { id:'usr-2', tenantId:'tenant-demo', username:'sachini', displayName:'Sachini Fernando', role:'cashier', branch:'Main Branch', status:'active', lastLogin:day(-1), tempPassword:true, password:'Temp@123#' },
      { id:'usr-3', tenantId:'tenant-demo', username:'dilshan', displayName:'Dilshan Silva', role:'stores', branch:'Main Warehouse', status:'active', lastLogin:day(-2), tempPassword:false, password:'Demo@123#' },
      { id:'usr-4', tenantId:'tenant-demo', username:'hasini', displayName:'Hasini Jayawardena', role:'accounts', branch:'Head Office', status:'active', lastLogin:day(-1), tempPassword:false, password:'Demo@123#' },
      { id:'usr-5', tenantId:'tenant-north', username:'northadmin', displayName:'Northway Admin', role:'shop_admin', branch:'Main Branch', status:'active', lastLogin:day(-3), tempPassword:false, password:'Demo@123#' }
    ],
    products: [
      { id:'p1', tenantId:'tenant-demo', sku:'ELE-CAB-25-BLK', barcode:'4796001001011', name:'Kelani Cable 2.5mm² Black', category:'Electrical', brand:'Kelani', baseUom:'M', purchaseUom:'ROLL', conversion:100, avgCost:205, retail:295, trade:275, wholesale:258, minPrice:245, stock:482.5, reserved:42, reorder:250, warehouse:'Main Warehouse', rack:'E04-B03', status:'active', serial:false, batch:false },
      { id:'p2', tenantId:'tenant-demo', sku:'PLB-PVC-100-4M', barcode:'4796001001028', name:'S-Lon PVC Pipe 1” × 4m', category:'Plumbing', brand:'S-Lon', baseUom:'LEN', purchaseUom:'BUNDLE', conversion:10, avgCost:890, retail:1250, trade:1160, wholesale:1080, minPrice:1035, stock:86, reserved:8, reorder:50, warehouse:'Main Warehouse', rack:'P02-A01', status:'active', serial:false, batch:false },
      { id:'p3', tenantId:'tenant-demo', sku:'TLS-DRL-BOS-13', barcode:'3165140987654', name:'Bosch GSB 13 RE Impact Drill', category:'Power Tools', brand:'Bosch', baseUom:'PCS', purchaseUom:'PCS', conversion:1, avgCost:17800, retail:22900, trade:21500, wholesale:20400, minPrice:19800, stock:12, reserved:2, reorder:6, warehouse:'Showroom', rack:'T01-C02', status:'active', serial:true, batch:false },
      { id:'p4', tenantId:'tenant-demo', sku:'FST-SCR-2IN-100', barcode:'4796001001042', name:'Wood Screw 2” — Box 100', category:'Fasteners', brand:'Generic', baseUom:'PCS', purchaseUom:'BOX', conversion:100, avgCost:3.8, retail:6.5, trade:5.8, wholesale:5.2, minPrice:4.8, stock:3420, reserved:250, reorder:1500, warehouse:'Main Warehouse', rack:'F06-D04', status:'active', serial:false, batch:false },
      { id:'p5', tenantId:'tenant-demo', sku:'PNT-EML-WHT-4L', barcode:'9556005004055', name:'Nippon Q-Shield White 4L', category:'Paint', brand:'Nippon', baseUom:'TIN', purchaseUom:'CARTON', conversion:4, avgCost:6350, retail:7850, trade:7480, wholesale:7150, minPrice:6980, stock:28, reserved:3, reorder:24, warehouse:'Showroom', rack:'PA03-B02', status:'active', serial:false, batch:true },
      { id:'p6', tenantId:'tenant-demo', sku:'BLD-CEM-INSEE-50', barcode:'4796001001066', name:'INSEE Sanstha Cement 50kg', category:'Building Materials', brand:'INSEE', baseUom:'BAG', purchaseUom:'BAG', conversion:1, avgCost:1920, retail:2150, trade:2090, wholesale:2050, minPrice:2010, stock:142, reserved:55, reorder:100, warehouse:'Yard', rack:'YARD-C1', status:'active', serial:false, batch:true },
      { id:'p7', tenantId:'tenant-demo', sku:'PLB-TAP-ANG-12', barcode:'4796001001073', name:'Angle Valve 1/2” Chrome', category:'Plumbing', brand:'AquaPro', baseUom:'PCS', purchaseUom:'BOX', conversion:20, avgCost:690, retail:980, trade:910, wholesale:850, minPrice:820, stock:8, reserved:1, reorder:20, warehouse:'Showroom', rack:'P04-C05', status:'active', serial:false, batch:false },
      { id:'p8', tenantId:'tenant-demo', sku:'SAF-GLV-NIT-L', barcode:'4796001001080', name:'Nitrile Coated Work Gloves — L', category:'Safety', brand:'ProSafe', baseUom:'PAIR', purchaseUom:'DOZEN', conversion:12, avgCost:285, retail:450, trade:410, wholesale:375, minPrice:350, stock:64, reserved:10, reorder:36, warehouse:'Showroom', rack:'S01-A03', status:'active', serial:false, batch:false }
    ],
    customers: [
      { id:'c1', tenantId:'tenant-demo', code:'CUS-0001', name:'Walk-in Customer', type:'Retail', phone:'', email:'', creditLimit:0, creditDays:0, outstanding:0, priceGroup:'Retail', status:'active' },
      { id:'c2', tenantId:'tenant-demo', code:'CUS-0012', name:'Sunrise Construction (Pvt) Ltd', type:'Contractor', phone:'077 321 8890', email:'accounts@sunrise.demo', creditLimit:750000, creditDays:30, outstanding:328500, priceGroup:'Contractor', status:'active' },
      { id:'c3', tenantId:'tenant-demo', code:'CUS-0027', name:'M.R. Electricals', type:'Dealer', phone:'071 220 1778', email:'', creditLimit:350000, creditDays:21, outstanding:98450, priceGroup:'Trade', status:'active' },
      { id:'c4', tenantId:'tenant-demo', code:'CUS-0041', name:'Lakmini Homes', type:'Retail', phone:'076 889 1200', email:'', creditLimit:100000, creditDays:14, outstanding:27000, priceGroup:'Retail', status:'active' }
    ],
    suppliers: [
      { id:'s1', tenantId:'tenant-demo', code:'SUP-001', name:'Kelani Cables PLC', phone:'011 555 4411', contact:'Trade Sales', terms:30, payable:445000, lastPurchase:day(-5), status:'active' },
      { id:'s2', tenantId:'tenant-demo', code:'SUP-002', name:'Hardware Distribution Lanka', phone:'011 288 9010', contact:'Nuwan', terms:45, payable:812300, lastPurchase:day(-2), status:'active' },
      { id:'s3', tenantId:'tenant-demo', code:'SUP-003', name:'BuildMart Agencies', phone:'077 200 1144', contact:'Fazal', terms:21, payable:188900, lastPurchase:day(-8), status:'active' }
    ],
    sales: [
      { id:'INV-2609-0142', tenantId:'tenant-demo', date:day(0), customer:'Walk-in Customer', subtotal:48750, discount:0, tax:0, total:48750, cost:37120, paid:48750, payment:'Cash', status:'paid', user:'Sachini Fernando', lines:[{productId:'p3',sku:'TLS-DRL-BOS-13',name:'Bosch GSB 13 RE Impact Drill',baseUom:'PCS',qty:2,price:22900,avgCost:17800},{productId:'p8',sku:'SAF-GLV-NIT-L',name:'Nitrile Coated Work Gloves — L',baseUom:'PAIR',qty:7,price:421.43,avgCost:217.14}] },
      { id:'INV-2609-0141', tenantId:'tenant-demo', date:day(0), customer:'Sunrise Construction (Pvt) Ltd', subtotal:129800, discount:0, tax:0, total:129800, cost:104400, paid:0, payment:'Credit', status:'credit', user:'Nimesh Perera', lines:[{productId:'p6',sku:'BLD-CEM-INSEE-50',name:'INSEE Sanstha Cement 50kg',baseUom:'BAG',qty:60,price:2090,avgCost:1920},{productId:'p4',sku:'FST-SCR-2IN-100',name:'Wood Screw 2” — Box 100',baseUom:'PCS',qty:676,price:6.51,avgCost:3.8}] },
      { id:'INV-2609-0139', tenantId:'tenant-demo', date:day(-1), customer:'M.R. Electricals', total:86500, cost:68950, payment:'Bank', status:'paid', user:'Nimesh Perera' },
      { id:'INV-2609-0135', tenantId:'tenant-demo', date:day(-2), customer:'Walk-in Customer', total:32600, cost:24900, payment:'Card', status:'paid', user:'Sachini Fernando' },
      { id:'INV-2609-0128', tenantId:'tenant-demo', date:day(-3), customer:'Lakmini Homes', total:116000, cost:90750, payment:'Credit', status:'partial', user:'Nimesh Perera' }
    ],
    purchaseOrders: [
      { id:'PO-2609-0041', tenantId:'tenant-demo', supplier:'Hardware Distribution Lanka', date:day(-1), expected:day(3), total:685000, status:'approved', items:12 },
      { id:'PO-2609-0038', tenantId:'tenant-demo', supplier:'Kelani Cables PLC', date:day(-4), expected:day(1), total:420000, status:'partial', items:4 },
      { id:'PO-2609-0034', tenantId:'tenant-demo', supplier:'BuildMart Agencies', date:day(-8), expected:day(-1), total:198400, status:'overdue', items:7 }
    ],
    quotations: [
      { id:'QT-2609-0088', tenantId:'tenant-demo', customer:'Sunrise Construction (Pvt) Ltd', date:day(0), validity:day(14), amount:486500, status:'sent' },
      { id:'QT-2609-0081', tenantId:'tenant-demo', customer:'Lakmini Homes', date:day(-2), validity:day(12), amount:212800, status:'accepted' },
      { id:'QT-2609-0076', tenantId:'tenant-demo', customer:'M.R. Electricals', date:day(-5), validity:day(9), amount:98500, status:'draft' }
    ],
    salesOrders: [],
    deliveries: [
      { id:'DEL-2609-023', tenantId:'tenant-demo', date:day(0), customer:'Sunrise Construction (Pvt) Ltd', site:'Mawathagama Site', vehicle:'WP CAD-4812', driver:'Ruwan', status:'out_for_delivery', packages:18 },
      { id:'DEL-2609-022', tenantId:'tenant-demo', date:day(0), customer:'Lakmini Homes', site:'Kurunegala', vehicle:'NW BEE-2291', driver:'Dinesh', status:'ready', packages:7 },
      { id:'DEL-2609-019', tenantId:'tenant-demo', date:day(-1), customer:'M.R. Electricals', site:'Kuliyapitiya', vehicle:'WP CAD-4812', driver:'Ruwan', status:'delivered', packages:4 }
    ],
    warrantyClaims: [
      { id:'WC-2609-019', tenantId:'tenant-demo', serial:'BOS13RE-442190', product:'Bosch GSB 13 RE Impact Drill', customer:'Lakmini Homes', received:day(-3), status:'testing', note:'Intermittent power loss' },
      { id:'WC-2609-011', tenantId:'tenant-demo', serial:'PMP90-81200', product:'Water Pump 0.5HP', customer:'Sunrise Construction (Pvt) Ltd', received:day(-9), status:'supplier', note:'Motor overheating' }
    ],
    receipts: [],
    supplierPayments: [],
    cheques: [],
    cashShifts: [],
    expenses: [
      { id:'EXP-0091', tenantId:'tenant-demo', date:day(0), category:'Transport', description:'Local delivery fuel', amount:9800, status:'approved' },
      { id:'EXP-0089', tenantId:'tenant-demo', date:day(-1), category:'Loading', description:'Cement unloading labour', amount:6500, status:'approved' },
      { id:'EXP-0084', tenantId:'tenant-demo', date:day(-2), category:'Repairs', description:'Forklift service', amount:28500, status:'pending' }
    ],
    returns: [],
    grns: [],
    stockCounts: [],
    stockMovements: [
      { id:'SM-1001', tenantId:'tenant-demo', date:day(0), sku:'ELE-CAB-25-BLK', type:'Sale', qty:-17.5, ref:'INV-2609-0142', warehouse:'Main Warehouse', user:'Sachini Fernando' },
      { id:'SM-1002', tenantId:'tenant-demo', date:day(0), sku:'FST-SCR-2IN-100', type:'Sale', qty:-100, ref:'INV-2609-0142', warehouse:'Main Warehouse', user:'Sachini Fernando' },
      { id:'SM-1003', tenantId:'tenant-demo', date:day(-1), sku:'BLD-CEM-INSEE-50', type:'GRN', qty:100, ref:'GRN-2609-0031', warehouse:'Yard', user:'Dilshan Silva' },
      { id:'SM-1004', tenantId:'tenant-demo', date:day(-1), sku:'PLB-TAP-ANG-12', type:'Adjustment', qty:-2, ref:'ADJ-2609-0012', warehouse:'Showroom', user:'Dilshan Silva' }
    ],
    auditLogs: [
      { id:'AL-1', tenantId:'tenant-demo', at:now(), user:'System Super Admin', action:'LOGIN', entity:'Session', detail:'Signed in to Super Admin dashboard' },
      { id:'AL-2', tenantId:'tenant-demo', at:day(-1)+'T10:22:00', user:'Nimesh Perera', action:'PRICE_UPDATE', entity:'Product ELE-CAB-25-BLK', detail:'Retail price changed Rs. 285 → Rs. 295' },
      { id:'AL-3', tenantId:'tenant-demo', at:day(-1)+'T09:14:00', user:'Dilshan Silva', action:'STOCK_ADJUST', entity:'Product PLB-TAP-ANG-12', detail:'Stock adjusted by -2; reason: damaged' }
    ],
    notifications: [
      { id:'n1', tenantId:'tenant-demo', type:'danger', title:'Low stock: Angle Valve 1/2”', body:'8 PCS available; reorder level is 20.', read:false },
      { id:'n2', tenantId:'tenant-demo', type:'warning', title:'PO overdue', body:'PO-2609-0034 was expected yesterday.', read:false },
      { id:'n3', tenantId:'tenant-demo', type:'info', title:'Credit follow-up', body:'Sunrise Construction has Rs. 328,500 outstanding.', read:false }
    ],
    settings: {
      'tenant-demo': { currency:'LKR', vatRate:18, ssclRate:2.5, taxRegistered:false, negativeStock:false, discountApproval:10, belowCostApproval:true, theme:'dark', posPaper:'80', invoiceFooter:'Thank you for your business.', invoiceTerms:'Goods sold are subject to store return and warranty policies.', documentBusinessName:'', documentAddress:'', documentPhone:'', documentEmail:'', documentBRN:'', documentVAT:'', barcodeDefaultSize:'50x25' }
    }
  };
}

function normalizeState(state) {
  state.meta ||= {version:1,createdAt:now(),lastSavedAt:now()};
  state.returns ||= []; state.grns ||= []; state.stockCounts ||= []; state.salesOrders ||= []; state.receipts ||= []; state.supplierPayments ||= []; state.cheques ||= []; state.cashShifts ||= [];
  state.sales ||= []; state.products ||= []; state.settings ||= {};
  for (const sale of state.sales) {
    sale.lines ||= [];
    sale.subtotal = Number(sale.subtotal ?? sale.total ?? 0);
    sale.discount = Number(sale.discount ?? 0);
    sale.tax = Number(sale.tax ?? 0);
    sale.paid = Number(sale.paid ?? (sale.status==='paid' ? sale.total : 0));
  }
  for (const sh of state.shops||[]) {
    const st = state.settings[sh.id] ||= {};
    Object.assign(st, {
      currency: st.currency || 'LKR', vatRate:Number(st.vatRate ?? 18), ssclRate:Number(st.ssclRate ?? 2.5),
      taxRegistered:!!st.taxRegistered, negativeStock:!!st.negativeStock, discountApproval:Number(st.discountApproval ?? 10),
      belowCostApproval: st.belowCostApproval !== false, theme:st.theme || 'dark', posPaper:String(st.posPaper||'80'),
      invoiceFooter:st.invoiceFooter || 'Thank you for your business.', invoiceTerms:st.invoiceTerms || '',
      documentBusinessName:st.documentBusinessName || '', documentAddress:st.documentAddress || '', documentPhone:st.documentPhone || '',
      documentEmail:st.documentEmail || '', documentBRN:st.documentBRN || '', documentVAT:st.documentVAT || '',
      barcodeDefaultSize:st.barcodeDefaultSize || '50x25'
    });
  }
  return state;
}

export function loadState() {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (existing?.meta?.version === 1) return normalizeState(existing);
  } catch (_) {}
  const initial = seed();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return normalizeState(initial);
}

export function saveState(state) {
  state.meta.lastSavedAt = now();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  return loadState();
}

export function nextId(prefix, collection) {
  const n = collection.length + 1;
  return `${prefix}-${String(n).padStart(4,'0')}`;
}

export function money(v) {
  return new Intl.NumberFormat('en-LK', { style:'currency', currency:'LKR', maximumFractionDigits:2 }).format(Number(v || 0));
}

export function num(v, digits=0) {
  return new Intl.NumberFormat('en-LK', { maximumFractionDigits: digits }).format(Number(v || 0));
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return new Intl.DateTimeFormat('en-LK', { day:'2-digit', month:'short', year:'numeric' }).format(d);
}

export function roleLabel(role) {
  return ({super_admin:'Super Admin',shop_admin:'Shop Admin',manager:'Manager',cashier:'Cashier',sales:'Sales',stores:'Stores',accounts:'Accounts',delivery:'Delivery',auditor:'Auditor'})[role] || role;
}
