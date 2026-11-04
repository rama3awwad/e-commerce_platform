const messages = {
  VALIDATION_ERROR: "البيانات المدخلة غير صحيحة، تأكد منها وحاول مرة أخرى",
  BAD_REQUEST: "الطلب غير صحيح",
  UNAUTHORIZED: "انتهت الجلسة، سجّل الدخول من جديد",
  FORBIDDEN: "ليس لديك صلاحية لهذه العملية",
  NOT_FOUND: "العنصر المطلوب غير موجود",
  CONFLICT: "العملية غير ممكنة لأن العنصر موجود مسبقاً أو مرتبط بعناصر أخرى",
  TOO_MANY_REQUESTS: "محاولات كثيرة، انتظر قليلاً ثم حاول مرة أخرى",
  INSUFFICIENT_STOCK: "الكمية المطلوبة غير متوفرة",
  INVALID_STATUS_TRANSITION: "لا يمكن تغيير حالة الطلب إلى هذه الحالة",
  INVENTORY_UNAVAILABLE: "خدمة المستودع غير متاحة حالياً، حاول لاحقاً",
  IMAGE_TOO_LARGE: "حجم الصورة كبير (الحد الأقصى 2 ميغابايت)",
  INVALID_IMAGE_TYPE: "نوع الصورة غير مدعوم (jpeg أو png أو webp فقط)",
  IMAGE_REQUIRED: "صورة المنتج مطلوبة",
  INTERNAL_ERROR: "حدث خطأ في السيرفر، حاول لاحقاً",
};

// overrides: لو بدنا رسالة مخصصة لكود معين بصفحة معينة
export function getErrorMessage(error, overrides = {}) {
  if (error.code === "ECONNABORTED") {
    return "انتهت مهلة الطلب، الخدمة بطيئة أو متوقفة، حاول لاحقاً";
  }
  if (!error.response) {
    return "تعذر الاتصال بالسيرفر، تأكد أن الباك إند شغال";
  }
  const data = error.response.data || {};
  const code = data.code;
  if (overrides[code]) {
    return overrides[code];
  }
  if (messages[code]) {
    return messages[code];
  }
  // تفاصيل الخطأ غير المعروف بتنطبع بالكونسول فقط (للتطوير)، والمستخدم بشوف رسالة عامة
  if (import.meta.env && import.meta.env.DEV) {
    console.error("[API]", error.response.status, data);
  }
  return "حدث خطأ غير متوقع، حاول مرة أخرى لاحقاً";
}

// أخطاء مؤقتة: إعادة المحاولة بتفيد فيها
// (المستودع واقف، انتهت المهلة، ما في اتصال، محاولات كثيرة)
export function isRetryable(error) {
  if (error.code === "ECONNABORTED") return true;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 503 || status === 429;
}