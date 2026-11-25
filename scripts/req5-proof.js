#!/usr/bin/env node
'use strict';
/**
 * المتطلب الخامس — إثبات التوزيع والاستمرارية.
 *   node scripts/req5-proof.js --total 500 --concurrency 10
 *   node scripts/req5-proof.js --total 4000 --concurrency 10 --stop backend-2 --stop-after 300
 *  node scripts/req5-proof.js --total 500 --concurrency 30 --orders 500
 * بيانات الدخول من PROOF_USER و PROOF_PASS (الافتراضي customer@test.com / Admin@123).
 * مراحل الاختبار تُصنَّف بوقت "بدء" الطلب لا بوقت اكتماله:
 *   before   : بدأ قبل إصدار أمر الإيقاف
 *   stopping : بدأ بعد إصدار الأمر وقبل أن يُنهي docker الإيقاف
 *   down     : بدأ بعد اكتمال الإيقاف (هذه المرحلة هي الدليل الحقيقي على الاستمرارية)
 *   after    : بدأ بعد إعادة تشغيل الخدمة
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://localhost:3000').replace(/\/$/, '');
const total = Math.max(1, Number(arg('total', 500)));
const concurrency = Math.max(1, Number(arg('concurrency', 20)));
const stopService = arg('stop', null);
const stopAfter = Math.max(1, Number(arg('stop-after', Math.floor(total * 0.3))));
const orderCount = Math.min(total, Math.max(0, Number(arg('orders', 0))));
const timeoutMs = Math.max(1000, Number(arg('timeout', 15000)));
const identifier = process.env.PROOF_USER || 'customer@test.com';
const password = process.env.PROOF_PASS || 'Admin@123';

const t0 = performance.now();
const now = () => performance.now() - t0;

async function request(url, options) {
  const startedAt = now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctl.signal });
    await res.arrayBuffer(); // نستهلك الجسم كي لا يبقى الاتصال محجوزاً
    return { status: res.status, instance: res.headers.get('x-instance-id') || '(missing)', startedAt, ms: now() - startedAt };
  } catch (e) {
    return { status: 0, instance: '(connection error)', startedAt, ms: now() - startedAt, error: e.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (e.cause?.code || e.message) };
  } finally { clearTimeout(timer); }
}

const run = (cmd, args) => new Promise((resolve) => {
  const c = spawn(cmd, args, { stdio: 'inherit' });
  c.once('error', () => resolve(1));
  c.once('exit', (code) => resolve(code ?? 1));
});

async function main() {
  const login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
  if (!login.ok) throw new Error(`Login failed: HTTP ${login.status} ${await login.text()}`);
  const token = (await login.json())?.data?.accessToken;
  if (!token) throw new Error('Login response is missing data.accessToken');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const pr = await (await fetch(`${base}/api/v1/products?limit=5`, { headers })).json();
  // نوزّع الأوردرات على عدة منتجات: كل الأوردرات على منتج واحد تضغط نفس الصف في خدمة المخزون (قفل)
  const products = (pr?.data?.items ?? pr?.data ?? []).filter((x) => x?.id);
  if (orderCount && !products.length) throw new Error('Could not find products for requested real orders');

  const results = new Array(total);
  const ev = { stopIssued: null, stopDone: null, startIssued: null, startDone: null };
  let next = 0, completed = 0, stopPromise = null;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= total) return;
      const k = index % 3;
      let route = k === 0 ? '/api/v1/products?limit=5' : k === 1 ? '/api/v1/orders?limit=5' : '/api/v1/health';
      let options = k === 2 ? undefined : { headers };
      if (index < orderCount) { route = '/api/v1/orders'; options = { method: 'POST', headers, body: JSON.stringify({ items: [{ productId: products[index % products.length].id, quantity: 1 }] }) }; }
      const r = await request(`${base}${route}`, options);
      r.index = index + 1;
      results[index] = r;
      completed++;
      if (stopService && !stopPromise && completed >= stopAfter) {
        ev.stopIssued = now();
        console.log(`\n>>> ${completed} طلب منجز: إصدار docker compose stop ${stopService}`);
        stopPromise = run('docker', ['compose', 'stop', '-t', '10', stopService]).then((code) => { ev.stopDone = now(); return code; });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  let stopCode = 0;
  if (stopPromise) stopCode = await stopPromise;

  // ---- إعادة التشغيل والتحقق من التعافي ----
  let recovery = null;
  if (stopService) {
    ev.startIssued = now();
    const startCode = await run('docker', ['compose', 'start', stopService]);
    ev.startDone = now();
    // Nginx يحلّ أسماء النسخ وقت الإقلاع/reload فقط، فنعيد تحميله ليرى عنوان النسخة الجديد
    if (stopService.startsWith('backend')) await run('docker', ['compose', 'exec', '-T', 'lb', 'nginx', '-s', 'reload']);
    const waitStart = now();
    let seen = false;
    while (now() - waitStart < 120000 && !seen) {
      const r = await request(`${base}/api/v1/health`);
      r.index = 0; r.phase = 'recovery-poll'; results.push(r);
      if (r.instance === stopService) { seen = true; break; }
      await new Promise((res) => setTimeout(res, 1000));
    }
    recovery = { startExitCode: startCode, recovered: seen, secondsUntilServing: seen ? Number(((now() - waitStart) / 1000).toFixed(1)) : null };
  }

  const phaseOf = (r) => {
    if (r.phase) return r.phase;
    if (!stopService || ev.stopIssued === null || r.startedAt < ev.stopIssued) return 'before';
    if (ev.stopDone === null || r.startedAt < ev.stopDone) return 'stopping';
    if (ev.startIssued === null || r.startedAt < ev.startIssued) return 'down';
    return 'after';
  };
  const phases = {};
  for (const r of results.filter(Boolean)) {
    const p = phaseOf(r);
    const o = (phases[p] ??= { requests: 0, ok: 0, failed: 0, byInstance: {}, byStatus: {} });
    o.requests++; (r.status >= 200 && r.status < 300) ? o.ok++ : o.failed++;
    o.byInstance[r.instance] = (o.byInstance[r.instance] || 0) + 1;
    o.byStatus[r.status] = (o.byStatus[r.status] || 0) + 1;
  }
  const main = results.slice(0, total).filter(Boolean);
  const times = main.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (times.length ? Number(times[Math.ceil(times.length * p) - 1].toFixed(1)) : 0);
  const failures = main.filter((r) => r.status < 200 || r.status >= 300).length;
  const checks = [];
  if (stopService) {
    const down = phases.down;
    checks.push({ name: 'طلبات بدأت والخدمة متوقفة فعلاً (يجب أن تكون كثيرة)', pass: !!down && down.requests >= 50, detail: down ? `${down.requests} طلب` : 'لا شيء: ارفعي --total' });
    checks.push({ name: `${stopService} لم تخدم أي طلب في مرحلة down`, pass: !!down && !(stopService in down.byInstance) });
    checks.push({ name: 'لا فشل في مرحلة down', pass: !!down && down.failed === 0, detail: down ? `${down.failed} فشل` : '' });
    checks.push({ name: `${stopService} عادت تخدم بعد إعادة التشغيل`, pass: !!recovery?.recovered, detail: recovery?.secondsUntilServing != null ? `${recovery.secondsUntilServing}s` : '' });
    checks.push({ name: 'أمر docker stop نجح', pass: stopCode === 0 });
  }
  const report = { base, total, concurrency, stopService, stopAfter, requestedOrders: orderCount, events: Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v === null ? null : Number((v / 1000).toFixed(2))])), phases, recovery, overall: { failures, p50: pct(0.5), p95: pct(0.95), max: Number((times.at(-1) || 0).toFixed(1)) }, checks, requests: results.filter(Boolean) };
  const out = path.resolve('results/req5-proof.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, requests: undefined }, null, 2));
  for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  (' + c.detail + ')' : ''}`);
  console.log(`Full results: ${out}`);
  if (failures || checks.some((c) => !c.pass)) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; });