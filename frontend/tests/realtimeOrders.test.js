import test from "node:test";
import assert from "node:assert/strict";
import { addNewOrder, applyStatusChange } from "../src/utils/realtimeOrders.js";

const a = { id: "a", status: "PENDING" };
const b = { id: "b", status: "CONFIRMED" };

test("الطلب الجديد يظهر بأول القائمة بالصفحة الأولى", () => {
  assert.deepEqual(addNewOrder([a], b, { page: 1 }).map((o) => o.id), ["b", "a"]);
});

test("الطلب الجديد لا يظهر بالصفحات الأخرى ولا يتكرر", () => {
  assert.deepEqual(addNewOrder([a], b, { page: 2 }), [a]);
  assert.deepEqual(addNewOrder([a, b], b, { page: 1 }), [a, b]);
});

test("الطلب الجديد يحترم فلتر الحالة وحد الصفحة", () => {
  assert.deepEqual(addNewOrder([a], b, { page: 1, status: "PENDING" }), [a]);
  assert.equal(addNewOrder([a, b], { id: "c", status: "PENDING" }, { page: 1, limit: 2 }).length, 2);
});

test("تغيّر الحالة يحدّث الطلب مكانه", () => {
  const res = applyStatusChange([a, b], { id: "a", status: "CONFIRMED" });
  assert.equal(res[0].status, "CONFIRMED");
  assert.equal(res.length, 2);
});

test("الطلب يختفي إذا لم يعد يناسب الفلتر، والطلب غير الظاهر يُتجاهل", () => {
  assert.deepEqual(applyStatusChange([a, b], { id: "a", status: "CONFIRMED" }, { status: "PENDING" }), [b]);
  assert.deepEqual(applyStatusChange([a], { id: "zzz", status: "CANCELLED" }), [a]);
});