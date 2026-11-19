export const EXCHANGES = { ORDERS: 'orders.events' } as const;
export const ROUTING_KEYS = { ORDER_CREATED: 'order.created' } as const;
export const QUEUES = { EMAIL: 'order.email', EMAIL_DLQ: 'order.email.dlq' } as const;

/** رأس الرسالة الذي يحمل عدد المحاولات الفاشلة حتى الآن. */
export const ATTEMPT_HEADER = 'x-attempt';

/** اسم الـ queue يحمل مدة التأخير، لأن RabbitMQ يرفض إعادة تعريف queue بوسائط TTL مختلفة. */
export const retryQueueName = (delayMs: number) => `order.email.retry.${delayMs}ms`;

/** "30000,90000" => [30000, 90000]. القيم غير الصالحة تُتجاهل. */
export function parseRetryDelays(raw?: string): number[] {
  const parsed = (raw ?? '30000,90000')
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return parsed.length ? parsed : [30000, 90000];
}