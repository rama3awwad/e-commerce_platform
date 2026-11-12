import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * المتطلب الثالث — التخزين المؤقت في HTTP عبر ETag.
 *
 * الطلب الأول:  الخادم يرد بالبيانات + ETag (بصمة sha1 لمحتوى data).
 * الطلبات التالية: العميل يرسل If-None-Match: <البصمة>.
 *   - لم تتغير البيانات → Express يرد 304 Not Modified بدون جسم (توفير على الشبكة).
 *   - تغيرت → 200 مع البيانات الجديدة وبصمة جديدة.
 *
 * البصمة تُحسب على data فقط وليس على الغلاف { success, data, timestamp }،
 * لأن timestamp يتغير كل مرة فيجعل البصمة مختلفة دائماً.
 * Cache-Control: no-cache يعني "مسموح التخزين لكن اسأل الخادم كل مرة"،
 * لذلك أي تعديل على منتج يظهر فوراً.
 */
@Injectable()
export class EtagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    if (process.env.ETAG_ENABLED === 'false' || req.method !== 'GET') return next.handle();

    return next.handle().pipe(
      tap((data) => {
        if (res.headersSent) return;
        const hash = createHash('sha1').update(JSON.stringify(data) ?? '').digest('base64url');
        res.setHeader('ETag', `"${hash}"`);
        res.setHeader('Cache-Control', 'private, no-cache');
      }),
    );
  }
}
