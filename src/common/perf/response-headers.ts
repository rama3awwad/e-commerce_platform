import { AsyncLocalStorage } from 'async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * المتطلب الثالث: نحفظ الـresponse الحالي في AsyncLocalStorage حتى تستطيع الخدمات
 * إضافة headers تشخيصية تظهر في Swagger بدون تمرير res في كل الدوال:
 *   X-Cache:       HIT | MISS | OFF          (هل جاء الرد من Redis؟)
 *   X-Read-Source: replica | primary          (من أي قاعدة قرأنا؟)
 */
const storage = new AsyncLocalStorage<Response>();

export function responseHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  storage.run(res, next);
}

export function setResponseHeader(name: string, value: string) {
  const res = storage.getStore();
  if (res && !res.headersSent) res.setHeader(name, value);
}
