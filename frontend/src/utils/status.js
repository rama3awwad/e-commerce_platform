export const statusLabels = {
  PENDING: "قيد الانتظار",
  CONFIRMED: "تم التأكيد",
  CANCELLED: "ملغي",
};

// التحولات المسموحة لحالة الطلب (نفس ترتيب الباك: order-transitions)
export const nextStatuses = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  CANCELLED: [],
};

// نص زر تغيير الحالة للمسؤول
export const statusActionLabels = {
  CONFIRMED: "تأكيد الطلب",
  CANCELLED: "إلغاء الطلب",
};

export const notificationTypeLabels = {
  ORDER_CREATED: "طلب جديد",
  ORDER_STATUS_CHANGED: "تحديث حالة الطلب",
};

export function formatDate(iso) {
  return new Date(iso).toLocaleString("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
