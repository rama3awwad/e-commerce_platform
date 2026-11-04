// تلخيص نتائج اختبار التزامن
// دوال عادية بدون React حتى نقدر نختبرها بـ npm test

// كل عنصر بـ outcomes هو: { ok: true } أو { ok: false, code: "INSUFFICIENT_STOCK" ... }
export function summarizeResults(outcomes, stockBefore, quantity, stockAfter) {
  const total = outcomes.length;
  const success = outcomes.filter((o) => o.ok).length;
  const stockFailed = outcomes.filter(
    (o) => !o.ok && o.code === "INSUFFICIENT_STOCK"
  ).length;
  // أي فشل ثاني (المستودع واقف، محاولات كثيرة، انتهت المهلة...)
  const otherFailed = total - success - stockFailed;

  // أكبر عدد طلبات ممكن ينجح حسب الكمية المتوفرة قبل الاختبار
  const expectedSuccess = Math.min(total, Math.floor(stockBefore / quantity));

  const inconclusive = otherFailed > 0; // ما منقدر نحكم على النتيجة
  const oversold = success > expectedSuccess; // انباع أكتر من المتوفر
  const correct = !inconclusive && success === expectedSuccess;

  // المخزون بعد الاختبار لازم يكون: قبل - (الناجح × الكمية)
  const expectedStockAfter = stockBefore - success * quantity;
  const stockConsistent =
    typeof stockAfter === "number" ? stockAfter === expectedStockAfter : null;

  return {
    total,
    success,
    stockFailed,
    otherFailed,
    expectedSuccess,
    inconclusive,
    oversold,
    correct,
    expectedStockAfter,
    stockConsistent,
  };
}