import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Pusher = require('pusher');

/** أسماء القنوات الخاصة (Private). البادئة private- إلزامية ليطلب المتصفح تفويضاً قبل الاشتراك. */
export const ADMIN_CHANNEL = 'private-admin.orders';
export const ORDER_CHANNEL_PREFIX = 'private-order.';
export const orderChannel = (orderId: string) => `${ORDER_CHANNEL_PREFIX}${orderId}`;

export interface OrderPayload { id: string; userId: string; status: string; [key: string]: unknown }

/**
 * المتطلب الرابع: التحديثات اللحظية عبر Soketi (خادم WebSocket مستضاف ذاتياً بحاوية مستقلة، متوافق مع بروتوكول Pusher).
 * - السيرفر لا يفتح أي اتصال مع المتصفحات: يرسل الحدث فقط إلى Soketi عبر HTTP، وSoketi يوزّعه على المشتركين.
 * - المتصفح يتصل بـ Soketi مباشرة، ويطلب من الـ API تفويض كل قناة (انظر RealtimeAuthController).
 * - الإطلاق لا يرمي أخطاء أبداً: لو Soketi واقع يبقى الطلب ناجحاً.
 */
@Injectable()
export class PusherService {
  private readonly logger = new Logger(PusherService.name);
  private readonly client: Pusher;

  constructor(config: ConfigService) {
    this.client = new Pusher({
      appId: config.get<string>('PUSHER_APP_ID', 'app-id'),
      key: config.get<string>('PUSHER_APP_KEY', 'app-key'),
      secret: config.get<string>('PUSHER_APP_SECRET', 'app-secret'),
      // داخل شبكة Docker: اسم الحاوية (soketi). خارجها: localhost
      host: config.get<string>('SOKETI_HOST', 'localhost'),
      port: String(config.get<string>('SOKETI_PORT', '6001')),
      useTLS: false,
      timeout: 3000,
    });
  }

  /** توقيع اشتراك قناة خاصة (يُستدعى فقط بعد أن يتأكد الـ controller من صلاحية المستخدم). */
  authorizeChannel(socketId: string, channel: string): { auth: string } {
    return this.client.authorizeChannel(socketId, channel);
  }

  emitOrderCreated(order: OrderPayload) {
    this.trigger([ADMIN_CHANNEL], 'order.created', order);
  }

  emitOrderStatusChanged(order: OrderPayload) {
    this.trigger([orderChannel(order.id), ADMIN_CHANNEL], 'order.status.changed', order);
  }

  private trigger(channels: string[], event: string, data: unknown) {
    try {
      this.client.trigger(channels, event, data).then(
        (res) => { if (!res.ok) this.logger.error(`Soketi rejected ${event}: HTTP ${res.status}`); },
        (e: Error) => this.logger.error(`Realtime emit failed (${event}): ${e.message}`),
      );
    } catch (e) {
      this.logger.error(`Realtime emit failed (${event}): ${(e as Error).message}`);
    }
  }
}