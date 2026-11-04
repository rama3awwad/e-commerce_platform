// اختبارات بسيطة بدون أي مكتبة خارجية: node --test
import test from "node:test";
import assert from "node:assert/strict";
import { statusLabels, nextStatuses } from "../src/utils/status.js";
import { getErrorMessage } from "../src/api/errors.js";

// ===== statusLabels / nextStatuses =====

test("كل حالات الطلب الخمسة إلها تسمية عربية", () => {
  assert.deepEqual(Object.keys(statusLabels).sort(), [
    "CANCELLED",
    "CONFIRMED",
    "DELIVERED",
    "PENDING",
    "SHIPPED",
  ]);
  for (const label of Object.values(statusLabels)) {
    assert.equal(typeof label, "string");
    assert.ok(label.length > 0);
  }
});

test("التحولات المسموحة مطابقة لقواعد الباك (order-transitions)", () => {
  assert.deepEqual(nextStatuses.PENDING, ["CONFIRMED", "CANCELLED"]);
  assert.deepEqual(nextStatuses.CONFIRMED, ["SHIPPED", "CANCELLED"]);
  assert.deepEqual(nextStatuses.SHIPPED, ["DELIVERED"]);
  assert.deepEqual(nextStatuses.DELIVERED, []);
  assert.deepEqual(nextStatuses.CANCELLED, []);
});

test("ما في تحول من حالة نهائية (DELIVERED أو CANCELLED)", () => {
  assert.equal(nextStatuses.DELIVERED.length, 0);
  assert.equal(nextStatuses.CANCELLED.length, 0);
});

// ===== getErrorMessage =====

test("مهلة الطلب بتطلع رسالة انتهاء المهلة", () => {
  const msg = getErrorMessage({ code: "ECONNABORTED" });
  assert.ok(msg.includes("مهلة الطلب"));
});

test("بدون رد من السيرفر بتطلع رسالة الاتصال", () => {
  const msg = getErrorMessage({});
  assert.ok(msg.includes("تعذر الاتصال"));
});

test("أكواد الباك المعروفة بترجع رسالتها العربية", () => {
  const error = { response: { status: 409, data: { code: "INSUFFICIENT_STOCK" } } };
  assert.ok(getErrorMessage(error).includes("الكمية"));
});

test("overrides بيغلبوا الرسائل العامة", () => {
  const error = { response: { status: 409, data: { code: "INVALID_STATUS_TRANSITION" } } };
  const msg = getErrorMessage(error, { INVALID_STATUS_TRANSITION: "رسالة مخصصة" });
  assert.equal(msg, "رسالة مخصصة");
});

test("كود غير معروف بيرجع رسالة عامة (بدون رسالة التشخيص القديمة)", () => {
  const error = { response: { status: 418, data: { code: "WEIRD_CODE", message: "teapot" } } };
  const msg = getErrorMessage(error);
  assert.ok(!msg.includes("418"), "ما منعرض رقم الخطأ للمستخدم");
  assert.ok(!msg.includes("teapot"), "ما منعرض رسالة الباك الخام للمستخدم");
  assert.ok(msg.length > 0);
});
