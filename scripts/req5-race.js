#!/usr/bin/env node
'use strict';
/**
 * اختبار تسابق على مخزون محدود عبر Nginx (3 نسخ):
 *   node scripts/req5-race.js --stock 100 --total 500 --concurrency 50
 * يضبط المخزون (أدمن)، يرسل الطلبات (زبون)، ثم يتحقق: الناجح = المخزون بالضبط، والمخزون بعدها صفر.
 * يتطلب تشغيل النظام بـ THROTTLE_LIMIT كبير (مثلاً 100000).
 */
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const total = Math.max(1, Number(arg('total', 500)));
const concurrency = Math.max(1, Number(arg('concurrency', 50)));
const stock = Math.max(0, Number(arg('stock', 100)));
const productArg = arg('product', null);
const adminUser = process.env.ADMIN_USER || 'admin@store.com';
const adminPass = process.env.ADMIN_PASS || 'Admin@123';
const custUser = process.env.PROOF_USER || 'customer@test.com';
const custPass = process.env.PROOF_PASS || 'Admin@123';

async function login(identifier, password) {
  const res = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
  if (!res.ok) throw new Error(`Login failed for ${identifier}: HTTP ${res.status} ${await res.text()}`);
  const token = (await res.json())?.data?.accessToken;
  if (!token) throw new Error('Login response is missing data.accessToken');
  return token;
}
const auth = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const getStock = async (token, id) => (await (await fetch(`${base}/api/v1/products/${id}`, { headers: auth(token) })).json())?.data?.stock;

async function main() {
  const adminToken = await login(adminUser, adminPass);
  const custToken = await login(custUser, custPass);

  const list = await (await fetch(`${base}/api/v1/products?limit=5`, { headers: auth(custToken) })).json();
  const items = list?.data?.items ?? [];
  const productId = productArg || items[0]?.id;
  if (!productId) throw new Error('No product found');

  const set = await fetch(`${base}/api/v1/products/${productId}/stock`, { method: 'PATCH', headers: auth(adminToken), body: JSON.stringify({ quantity: stock }) });
  if (!set.ok) throw new Error(`Setting stock failed: HTTP ${set.status} ${await set.text()}`);
  const stockBefore = await getStock(custToken, productId);
  console.log(`Product ${productId}: stock before = ${stockBefore}; sending ${total} orders (concurrency ${concurrency})`);

  const t0 = performance.now();
  const results = [];
  let next = 0;
  async function worker() {
    while (next < total) {
      next += 1;
      const s = performance.now();
      try {
        const res = await fetch(`${base}/api/v1/orders`, { method: 'POST', headers: auth(custToken), body: JSON.stringify({ items: [{ productId, quantity: 1 }] }) });
        const body = await res.json().catch(() => ({}));
        results.push({ status: res.status, code: body?.code || '', instance: res.headers.get('x-instance-id') || '(missing)', ms: performance.now() - s });
      } catch (e) {
        results.push({ status: 0, code: e.cause?.code || e.message, instance: '(connection error)', ms: performance.now() - s });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  const seconds = (performance.now() - t0) / 1000;

  const stockAfter = await getStock(custToken, productId);
  const count = (fn) => results.filter(fn).length;
  const created = count((r) => r.status === 201);
  const noStock = count((r) => r.status === 409 && r.code === 'INSUFFICIENT_STOCK');
  const other = results.length - created - noStock;
  const byInstance = {};
  for (const r of results) byInstance[r.instance] = (byInstance[r.instance] || 0) + 1;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => Number(times[Math.max(0, Math.ceil(times.length * p) - 1)].toFixed(1));

  const expectedCreated = Math.min(total, stockBefore);
  const checks = [
    { name: `created == ${expectedCreated} (exactly the stock)`, pass: created === expectedCreated, detail: `${created}` },
    { name: 'no overselling: stock after == max(0, before - created)', pass: stockAfter === Math.max(0, stockBefore - created), detail: `after=${stockAfter}` },
    { name: 'no unexpected errors (only 201 and 409 INSUFFICIENT_STOCK)', pass: other === 0, detail: `${other} other` },
    { name: 'all 3 backends handled requests', pass: ['backend-1', 'backend-2', 'backend-3'].every((n) => byInstance[n] > 0) },
  ];
  const report = { base, productId, total, concurrency, stockBefore, stockAfter, created, insufficientStock: noStock, other, seconds: Number(seconds.toFixed(1)), rps: Number((total / seconds).toFixed(1)), p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), byInstance, checks };
  const out = path.resolve('results/req5-race.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? `  (${c.detail})` : ''}`);
  console.log(`\nUse this product id in verify queries: ${productId}\nFull results: ${out}`);
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });