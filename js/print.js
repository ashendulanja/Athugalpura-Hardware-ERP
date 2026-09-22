const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
const money = v => new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR',maximumFractionDigits:2}).format(Number(v||0));

function shopBlock(shop, settings={}) {
  const name = settings.documentBusinessName || shop?.name || 'Hardware Store';
  const address = settings.documentAddress || shop?.address || '';
  const phone = settings.documentPhone || shop?.phone || '';
  const email = settings.documentEmail || shop?.email || '';
  const brn = settings.documentBRN || shop?.brn || '';
  const vat = settings.documentVAT || shop?.vat || '';
  return {name,address,phone,email,brn,vat};
}

export function invoiceDocument(invoice, shop, settings={}, mode='a4') {
  const b=shopBlock(shop,settings), lines=invoice.lines||[], tax=Number(invoice.tax||0), discount=Number(invoice.discount||0), subtotal=Number(invoice.subtotal ?? lines.reduce((a,x)=>a+Number(x.qty||0)*Number(x.price||0),0));
  const isPos = mode==='pos58' || mode==='pos80';
  const width = mode==='pos58'?'58mm':mode==='pos80'?'80mm':'210mm';
  const page = isPos ? 'auto' : 'A4';
  const customer = invoice.customer || 'Walk-in Customer';
  const footer = settings.invoiceFooter || 'Thank you for your business.';
  const rows = lines.length ? lines.map((x,i)=>isPos
    ? `<tr><td>${i+1}. ${esc(x.name)}<div class="muted">${esc(x.sku||'')} • ${x.qty} ${esc(x.baseUom||'')}</div></td><td class="num">${money(Number(x.qty)*Number(x.price))}</td></tr>`
    : `<tr><td>${i+1}</td><td><b>${esc(x.name)}</b><div class="muted">${esc(x.sku||'')}</div></td><td>${esc(x.baseUom||'')}</td><td class="num">${Number(x.qty).toLocaleString('en-LK',{maximumFractionDigits:3})}</td><td class="num">${money(x.price)}</td><td class="num">${money(Number(x.qty)*Number(x.price))}</td></tr>`).join('')
    : `<tr><td colspan="6" class="muted">Line details are unavailable for this legacy invoice.</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(invoice.id)}</title><style>
  @page{size:${page};margin:${isPos?'3mm':'12mm'}}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:${isPos?'10px':'12px'};background:#fff}.doc{width:${width};max-width:100%;margin:auto}.head{display:flex;justify-content:space-between;gap:20px;border-bottom:${isPos?'1px dashed #555':'2px solid #111'};padding-bottom:${isPos?'7px':'14px'};margin-bottom:${isPos?'7px':'18px'}}.brand h1{font-size:${isPos?'17px':'25px'};margin:0 0 4px}.brand p,.meta p{margin:2px 0}.meta{text-align:right}.title{font-weight:800;font-size:${isPos?'13px':'20px'};letter-spacing:.08em;margin:${isPos?'6px 0':'14px 0'}}.customer{padding:${isPos?'6px 0':'10px 12px'};${isPos?'border-top:1px dashed #aaa;border-bottom:1px dashed #aaa':'border-left:3px solid #111;background:#f5f5f5'};margin-bottom:10px}.customer b{display:block;margin-bottom:3px}table{width:100%;border-collapse:collapse}th{font-size:${isPos?'8px':'10px'};text-transform:uppercase;text-align:left;border-bottom:1px solid #555;padding:${isPos?'4px 2px':'7px'}}td{padding:${isPos?'5px 2px':'8px 7px'};border-bottom:1px solid #ddd;vertical-align:top}.num{text-align:right}.muted{font-size:${isPos?'8px':'10px'};color:#666;margin-top:2px}.totals{width:${isPos?'100%':'42%'};margin:${isPos?'8px 0 0':'16px 0 0 auto'}}.tr{display:flex;justify-content:space-between;padding:3px 0}.grand{font-size:${isPos?'14px':'17px'};font-weight:800;border-top:2px solid #111;margin-top:4px;padding-top:7px}.foot{text-align:center;color:#555;font-size:${isPos?'8px':'10px'};margin-top:${isPos?'9px':'28px'};padding-top:8px;border-top:1px ${isPos?'dashed':'solid'} #bbb}.no-print{position:fixed;right:12px;top:12px;padding:9px 14px;background:#111;color:#fff;border:0;border-radius:8px;cursor:pointer}@media print{.no-print{display:none}.doc{margin:0}}</style></head><body><button class="no-print" onclick="window.print()">Print</button><div class="doc">
  <div class="head"><div class="brand"><h1>${esc(b.name)}</h1><p>${esc(b.address)}</p><p>${esc(b.phone)}${b.email?' • '+esc(b.email):''}</p>${b.brn?`<p>BRN: ${esc(b.brn)}</p>`:''}${b.vat?`<p>VAT: ${esc(b.vat)}</p>`:''}</div><div class="meta"><div class="title">${esc(invoice.docTitle || (settings.taxRegistered?'TAX INVOICE':'INVOICE'))}</div><p><b>${esc(invoice.id)}</b></p><p>${esc(invoice.date||new Date().toISOString().slice(0,10))}</p><p>${esc(invoice.payment||'')}</p></div></div>
  <div class="customer"><b>Bill To</b>${esc(customer)}${invoice.customerPhone?`<div>${esc(invoice.customerPhone)}</div>`:''}${invoice.customerAddress?`<div>${esc(invoice.customerAddress)}</div>`:''}</div>
  <table><thead><tr>${isPos?'<th>Item</th><th class="num">Amount</th>':'<th>#</th><th>Item</th><th>UOM</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Amount</th>'}</tr></thead><tbody>${rows}</tbody></table>
  <div class="totals"><div class="tr"><span>Subtotal</span><b>${money(subtotal)}</b></div>${discount?`<div class="tr"><span>Discount</span><b>-${money(discount)}</b></div>`:''}${tax?`<div class="tr"><span>VAT / Tax</span><b>${money(tax)}</b></div>`:''}<div class="tr grand"><span>Total</span><span>${money(invoice.total)}</span></div>${invoice.paid!=null?`<div class="tr"><span>Paid</span><b>${money(invoice.paid)}</b></div><div class="tr"><span>Balance</span><b>${money(Math.max(0,Number(invoice.total)-Number(invoice.paid||0)))}</b></div>`:''}</div>
  <div class="foot">${esc(footer)}${settings.invoiceTerms?`<br>${esc(settings.invoiceTerms)}`:''}<br>Printed ${new Date().toLocaleString('en-LK')}</div>
  </div><script>setTimeout(()=>window.print(),250)</script></body></html>`;
}

export function openInvoicePrint(invoice, shop, settings, mode='a4') {
  const w=window.open('','_blank');
  if(!w) throw new Error('Popup blocked. Allow popups to print documents.');
  w.document.open(); w.document.write(invoiceDocument(invoice,shop,settings,mode)); w.document.close();
}

export function renderBarcodeSVG(value, format='CODE128', width=2, height=48, displayValue=true) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  try {
    window.JsBarcode(svg,String(value||''),{format,margin:0,width,height,displayValue,fontSize:11,textMargin:2});
  } catch (_) {
    window.JsBarcode(svg,String(value||''),{format:'CODE128',margin:0,width,height,displayValue,fontSize:11,textMargin:2});
  }
  return svg.outerHTML;
}

export function barcodePrintDocument(queue, opts={}) {
  const [w,h]=(opts.size||'50x25').split('x').map(Number); const customW=Number(opts.customWidth||w), customH=Number(opts.customHeight||h);
  const labelW=customW||50,labelH=customH||25, mode=opts.mode||'roll';
  const all=[];
  queue.forEach(q=>{for(let i=0;i<Number(q.copies||1);i++) all.push(q)});
  const pageCss=mode==='roll'?`@page{size:${labelW}mm ${labelH}mm;margin:0}`:'@page{size:A4;margin:8mm}';
  const gridCss=mode==='roll'?`display:block`:`display:grid;grid-template-columns:repeat(${Number(opts.columns||3)},${labelW}mm);grid-auto-rows:${labelH}mm;gap:${Number(opts.gap||2)}mm;align-content:start`;
  const labels=all.map(q=>{const p=q.product, svg=renderBarcodeSVG(p.barcode||p.sku,opts.format||'CODE128',Math.max(.8,Number(opts.barWidth||1.4)),Math.max(18,Math.min(58,labelH*1.5)),opts.showBarcodeText!==false);const price=opts.priceType==='custom'?Number(opts.customPrice||0):Number((p[opts.priceType||'retail'] ?? p.retail) || 0);return `<div class="label"><div class="inside">${opts.showName!==false?`<div class="name">${esc(p.name)}</div>`:''}${opts.showBrand?`<div class="line">${esc(p.brand||'')}</div>`:''}${opts.showModel&&p.model?`<div class="line">${esc(p.model)}</div>`:''}${opts.showCategory&&p.category?`<div class="line">${esc(p.category)}</div>`:''}${opts.showSpec&&p.specification?`<div class="spec">${esc(p.specification)}</div>`:''}<div class="barcode">${svg}</div><div class="bottom">${opts.showSku?`<span>${esc(p.sku)}</span>`:''}${opts.showUom?`<span>${esc(p.baseUom||'')}</span>`:''}${opts.showRack&&p.rack?`<span>${esc(p.rack)}</span>`:''}${opts.showPrice?`<b>${money(price)}</b>`:''}</div>${opts.customText?`<div class="custom">${esc(opts.customText)}</div>`:''}${opts.customText2?`<div class="custom">${esc(opts.customText2)}</div>`:''}</div></div>`}).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Barcode Labels</title><style>${pageCss}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,sans-serif}.sheet{${gridCss}}.label{width:${labelW}mm;height:${labelH}mm;overflow:hidden;page-break-after:${mode==='roll'?'always':'auto'};break-inside:avoid;padding:${Number(opts.padding||1.5)}mm}.inside{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden}.name{font-size:${Math.max(6,Math.min(12,Number(opts.nameSize||8)))}pt;font-weight:700;line-height:1.05;max-width:100%;overflow:hidden}.line,.custom{font-size:6.5pt;line-height:1.05}.spec{font-size:5.8pt;line-height:1.05;max-height:2.2em;overflow:hidden}.barcode{width:100%;display:flex;justify-content:center;align-items:center;overflow:hidden;margin:${labelH<20?'.5mm':'1mm'} 0}.barcode svg{max-width:100%;max-height:${Math.max(9,labelH*0.55)}mm}.bottom{width:100%;display:flex;justify-content:space-between;gap:2mm;align-items:center;font-size:6.5pt}.bottom b{font-size:7.5pt}.custom{margin-top:.4mm}.no-print{position:fixed;right:12px;top:12px;z-index:4;padding:9px 14px;background:#111;color:#fff;border:0;border-radius:8px}@media print{.no-print{display:none}}</style></head><body><button class="no-print" onclick="window.print()">Print</button><div class="sheet">${labels}</div><script>setTimeout(()=>window.print(),350)</script></body></html>`;
}

export function openBarcodePrint(queue, opts) {
  const w=window.open('','_blank'); if(!w) throw new Error('Popup blocked. Allow popups to print labels.');
  w.document.open(); w.document.write(barcodePrintDocument(queue,opts)); w.document.close();
}
