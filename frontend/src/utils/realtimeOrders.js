// دوال بسيطة (نقية) لدمج تحديثات الـ WebSocket بقائمة الطلبات الظاهرة بلوحة الأدمن.

// طلب جديد: يظهر بأول القائمة فقط إذا كنا بالصفحة الأولى والفلتر يناسبه، وبدون تكرار.
export function addNewOrder(orders, order, { page = 1, status = "", limit = 10 } = {}) {
  if (page !== 1) return orders;
  if (status && order.status !== status) return orders;
  if (orders.some((o) => o.id === order.id)) return orders;
  return [order, ...orders].slice(0, limit);
}

// تغيّرت حالة طلب: نحدّثه مكانه، أو نشيله إذا صار ما يناسب الفلتر الحالي.
export function applyStatusChange(orders, updated, { status = "" } = {}) {
  if (!orders.some((o) => o.id === updated.id)) return orders;
  if (status && updated.status !== status) return orders.filter((o) => o.id !== updated.id);
  return orders.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
}