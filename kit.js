// Static stand-in for kit.js, for demos hosted without the Python server (e.g. GitHub Pages).
// Same API as kit.js. The menu comes from menu.json next to the page; orders live in this
// browser's localStorage, and "payment" and kitchen progress are simulated on a timer.
window.Kit = (() => {
  const fmt = n => Number(n).toLocaleString('en-KE');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const at = ts => new Date(ts * 1000).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
  const nairobiNow = () => new Date(Date.now() + (new Date().getTimezoneOffset() + 180) * 60000);
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  function basket(key) {
    let c = store.get(key, {});
    const save = () => store.set(key, c);
    return {
      get: () => c,
      qty: id => c[id] || 0,
      add(id, q = 1) { c[id] = (c[id] || 0) + q; if (c[id] <= 0) delete c[id]; save(); },
      clear() { c = {}; try { localStorage.removeItem(key); } catch {} },
    };
  }

  let menuCache;
  async function menu() {
    if (!menuCache) {
      const d = await (await fetch('menu.json')).json();
      const items = {};
      d.categories.forEach(cat => cat.items.forEach(it => { items[it.id] = { ...it, category: cat.name }; }));
      menuCache = { categories: d.categories, delivery_fee: d.delivery_fee ?? 250, delivery: d.delivery ?? true, items };
    }
    return menuCache;
  }

  function totals(b, items, fulfilment = 'pickup', fee = 0) {
    const lines = Object.entries(b.get()).filter(([id, q]) => items[id] && q > 0).map(([id, q]) => ({ ...items[id], qty: q, line: items[id].price * q }));
    const subtotal = lines.reduce((s, l) => s + l.line, 0), count = lines.reduce((s, l) => s + l.qty, 0);
    const delivery = fulfilment === 'delivery' && lines.length ? fee : 0;
    return { lines, count, subtotal, delivery, total: subtotal + delivery };
  }

  async function placeOrder(b, { name, phone, fulfilment, address }) {
    if (!String(name || '').trim() || !String(phone || '').trim()) throw new Error('Add your name and M-Pesa number to continue.');
    if (fulfilment === 'delivery' && !String(address || '').trim()) throw new Error('Add a delivery address so the rider can find you.');
    if (!/^(\+?254|0)?[17]\d{8}$/.test(String(phone).replace(/\s+/g, ''))) throw new Error('Enter a Safaricom number like 0712 345 678.');
    const m = await menu(), t = totals(b, m.items, fulfilment, m.delivery_fee);
    if (!t.lines.length) throw new Error('Your order is empty.');
    const id = 'DEMO' + Math.random().toString(36).slice(2, 6).toUpperCase();
    const orders = store.get('kit-demo-orders', {});
    orders[id] = { id, created: Date.now(), fulfilment, items: t.lines.map(l => ({ id: l.id, name: l.name, price: l.price, qty: l.qty })), subtotal: t.subtotal, delivery_fee: t.delivery, total: t.total };
    store.set('kit-demo-orders', orders);
    b.clear();
    return { id };
  }

  // simulated journey: PIN prompt, then paid, cooking, ready or on the way, done
  const STEPS = [['awaiting_payment', 0], ['paid', 6], ['preparing', 14], ['ready|out_for_delivery', 32], ['completed', 55]];
  function snapshot(o) {
    const s = (Date.now() - o.created) / 1000, history = [];
    for (const [st, sec] of STEPS) {
      if (s < sec) break;
      const name = st.includes('|') ? (o.fulfilment === 'pickup' ? 'ready' : 'out_for_delivery') : st;
      if (name === 'out_for_delivery') history.push({ status: 'ready', at: (o.created / 1000) + sec - 4 });
      history.push({ status: name, at: (o.created / 1000) + sec });
    }
    return { ...o, status: history[history.length - 1].status, history, payment_error: null };
  }
  function track(id, onUpdate, onMissing) {
    let timer, last;
    const tick = () => {
      const o = store.get('kit-demo-orders', {})[id];
      if (!o) { onMissing && onMissing(); return; }
      const v = snapshot(o);
      v.reached = Object.fromEntries(v.history.map(h => [h.status, h.at]));
      v.active = !['awaiting_payment', 'payment_failed', 'cancelled'].includes(v.status);
      if (v.status !== last) { last = v.status; onUpdate(v); }
      if (v.status !== 'completed') timer = setTimeout(tick, 1000);
    };
    tick();
    return { retry: () => { clearTimeout(timer); tick(); } };
  }

  return { fmt, esc, at, nairobiNow, basket, menu, totals, placeOrder, track };
})();
