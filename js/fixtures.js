/* EvalBoard fixture database for the SQL result-equivalence scorer: a small fictional shop (customers on
   .example addresses, products, orders, order items), generated deterministically so every run sees the same rows. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./text.js'));
  else (root.EB = root.EB || {}).fixtures = factory(root.EB.text);
})(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';
  const SCHEMA = 'customers(id INTEGER PRIMARY KEY, name TEXT, email TEXT, city TEXT, signup_date TEXT, tier TEXT)\nproducts(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL)\norders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, status TEXT, total REAL)\norder_items(order_id INTEGER, product_id INTEGER, qty INTEGER, unit_price REAL)';
  function shopSQL() {
    const r = T.rng('evalboard-shop-v1'); const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
    const first = ['Ava', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farah', 'Gabe', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Marco', 'Nia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara'];
    const last = ['Park', 'Okafor', 'Silva', 'Novak', 'Reyes', 'Khan', 'Moreau', 'Sato', 'Petrov', 'Lind'];
    const cities = ['Austin', 'Denver', 'Seattle', 'Boston', 'Chicago'];
    const tiers = ['free', 'free', 'free', 'plus'];
    const out = ['CREATE TABLE customers(id INTEGER PRIMARY KEY, name TEXT, email TEXT, city TEXT, signup_date TEXT, tier TEXT);', 'CREATE TABLE products(id INTEGER PRIMARY KEY, name TEXT, category TEXT, price REAL);', 'CREATE TABLE orders(id INTEGER PRIMARY KEY, customer_id INTEGER, order_date TEXT, status TEXT, total REAL);', 'CREATE TABLE order_items(order_id INTEGER, product_id INTEGER, qty INTEGER, unit_price REAL);'];
    for (let i = 1; i <= 20; i++) { const n = first[i - 1] + ' ' + last[(i * 7) % 10]; const m = 1 + ((i * 5) % 12); out.push('INSERT INTO customers VALUES(' + i + ',' + q(n) + ',' + q(first[i - 1].toLowerCase() + '.' + last[(i * 7) % 10].toLowerCase() + '@mail.example') + ',' + q(cities[i % 5]) + ',' + q('2025-' + String(m).padStart(2, '0') + '-' + String(1 + ((i * 3) % 27)).padStart(2, '0')) + ',' + q(tiers[i % 4]) + ');'); }
    const prods = [['Trail Jacket', 'apparel', 129], ['Rain Shell', 'apparel', 89], ['Wool Socks', 'apparel', 14.5], ['Camp Stove', 'gear', 64], ['Headlamp', 'gear', 32], ['Water Filter', 'gear', 45.99], ['Day Pack', 'bags', 79], ['Duffel 60L', 'bags', 110], ['Trail Mix', 'food', 6.25], ['Coffee Beans', 'food', 15], ['GPS Watch', 'electronics', 249], ['Power Bank', 'electronics', 39]];
    prods.forEach((p, i) => out.push('INSERT INTO products VALUES(' + (i + 1) + ',' + q(p[0]) + ',' + q(p[1]) + ',' + p[2] + ');'));
    const statuses = ['delivered', 'delivered', 'delivered', 'shipped', 'cancelled', 'returned'];
    for (let o = 1; o <= 70; o++) {
      const cust = 1 + Math.floor(r() * 18); const month = 1 + Math.floor(r() * 10); const day = 1 + Math.floor(r() * 28); const st = statuses[Math.floor(r() * statuses.length)];
      const nItems = 1 + Math.floor(r() * 3); let total = 0; const items = [];
      for (let k = 0; k < nItems; k++) { const pid = 1 + Math.floor(r() * 12); if (items.some((x) => x[0] === pid)) continue; const qty = 1 + Math.floor(r() * 3); const up = prods[pid - 1][2]; total += qty * up; items.push([pid, qty, up]); }
      out.push('INSERT INTO orders VALUES(' + o + ',' + cust + ',' + q('2026-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')) + ',' + q(st) + ',' + Math.round(total * 100) / 100 + ');');
      for (const it of items) out.push('INSERT INTO order_items VALUES(' + o + ',' + it[0] + ',' + it[1] + ',' + it[2] + ');');
    }
    return out.join('\n');
  }
  let cached = null;
  function all() { if (!cached) cached = { shop: shopSQL() }; return cached; }
  return { SCHEMA, shopSQL, all };
});
