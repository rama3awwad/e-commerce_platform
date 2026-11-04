// اختبارات تلخيص نتائج اختبار التزامن + إعادة المحاولة
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeResults } from "../src/utils/concurrency.js";
import { isRetryable } from "../src/api/errors.js";

const ok = { ok: true };
const noStock = { ok: false, code: "INSUFFICIENT_STOCK" };

test("آخر قطعة: ينجح طلب واحد والباقي ينرفض = نتيجة صحيحة", () => {
  const s = summarizeResults([ok, noStock, noStock, noStock, noStock], 1, 1, 0);
  assert.equal(s.success, 1);
  assert.equal(s.stockFailed, 4);
  assert.equal(s.expectedSuccess, 1);
  assert.equal(s.correct, true);
  assert.equal(s.oversold, false);
  assert.equal(s.stockConsistent, true);
});

test("نجاح طلبين على قطعة وحدة = بيع زيادة", () => {
  const s = summarizeResults([ok, ok, noStock], 1, 1, -1);
  assert.equal(s.oversold, true);
  assert.equal(s.correct, false);
});

test("خطأ غير الكمية (مثل 503) = اختبار غير مكتمل", () => {
  const s = summarizeResults([ok, { ok: false, code: "INVENTORY_UNAVAILABLE" }], 1, 1, 0);
  assert.equal(s.inconclusive, true);
  assert.equal(s.correct, false);
  assert.equal(s.otherFailed, 1);
});

test("الكمية كافية للكل: ينجحوا كلهم", () => {
  const s = summarizeResults([ok, ok, ok], 10, 2, 4);
  assert.equal(s.expectedSuccess, 3);
  assert.equal(s.correct, true);
  assert.equal(s.expectedStockAfter, 4);
  assert.equal(s.stockConsistent, true);
});

test("رفض طلبات رغم إنه الكمية كافية = مو صحيح", () => {
  const s = summarizeResults([ok, noStock, noStock], 10, 1, 9);
  assert.equal(s.correct, false);
  assert.equal(s.oversold, false);
});

test("المخزون بعد الاختبار غير متطابق", () => {
  const s = summarizeResults([ok, noStock], 1, 1, 1);
  assert.equal(s.stockConsistent, false);
});

test("إذا ما عرفنا المخزون بعد الاختبار ما منحكم عليه", () => {
  const s = summarizeResults([ok, noStock], 1, 1, null);
  assert.equal(s.stockConsistent, null);
});

test("isRetryable: المهلة وانقطاع الاتصال و503 و429 مؤقتة", () => {
  assert.equal(isRetryable({ code: "ECONNABORTED" }), true);
  assert.equal(isRetryable({}), true);
  assert.equal(isRetryable({ response: { status: 503 } }), true);
  assert.equal(isRetryable({ response: { status: 429 } }), true);
});

test("isRetryable: أخطاء 400 و403 و404 و409 مو مؤقتة", () => {
  for (const status of [400, 401, 403, 404, 409]) {
    assert.equal(isRetryable({ response: { status } }), false);
  }
});