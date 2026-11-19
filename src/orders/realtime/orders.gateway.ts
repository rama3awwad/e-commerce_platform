import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { Role } from '../../common/enums/role.enum';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { RealtimeAuthService, RealtimeUser } from './realtime-auth.service';

export const ADMIN_ROOM = 'admin:orders';
export const orderRoom = (orderId: string) => `order:${orderId}`;

export interface OrderPayload { id: string; userId: string; status: string; [key: string]: unknown }
type Ack = { ok: true; closed?: boolean } | { ok: false; code: string; message: string };

/**
 * المتطلب الرابع: التحديثات اللحظية (Socket.IO مستضاف ذاتياً داخل نفس السيرفر، namespace = /realtime).
 *
 * القنوات (rooms):
 *   admin:orders  => للأدمن فقط. الأحداث: order.created و order.status.changed
 *   order:{id}    => لصاحب الطلب فقط. الحدث: order.status.changed
 *
 * الصلاحيات تُفحص على السيرفر مرتين: عند الاتصال (JWT) وعند كل اشتراك (الدور / ملكية الطلب).
 */
@WebSocketGateway({ namespace: 'realtime', cors: { origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((x) => x.trim()), credentials: true } })
export class OrdersGateway implements OnGatewayInit {
  private readonly logger = new Logger(OrdersGateway.name);
  @WebSocketServer() server!: Namespace;

  constructor(private readonly auth: RealtimeAuthService, private readonly prisma: OrdersPrismaService) {}

  afterInit(server: Namespace) {
    // middleware: يُنفَّذ قبل إتمام الاتصال، فالاتصال غير الموثّق يُرفض ولا يصل لأي room
    server.use(async (socket, next) => {
      try { socket.data.user = await this.auth.authenticate(socket.handshake.auth?.token as string | undefined); next(); }
      catch (e) { next(new Error((e as Error).message || 'Unauthorized')); }
    });
  }

  @SubscribeMessage('subscribe:admin')
  async subscribeAdmin(@ConnectedSocket() client: Socket): Promise<Ack> {
    const user = client.data.user as RealtimeUser | undefined;
    if (!user || user.role !== Role.ADMIN) return { ok: false, code: 'FORBIDDEN', message: 'Only administrators can subscribe to the admin channel' };
    await client.join(ADMIN_ROOM);
    return { ok: true };
  }

  @SubscribeMessage('subscribe:order')
  async subscribeOrder(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId?: string }): Promise<Ack> {
    const user = client.data.user as RealtimeUser | undefined;
    const orderId = body?.orderId;
    if (!user) return { ok: false, code: 'UNAUTHORIZED', message: 'Not authenticated' };
    if (typeof orderId !== 'string' || !orderId) return { ok: false, code: 'BAD_REQUEST', message: 'orderId is required' };
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, status: true } });
    // نفس الرد لو الطلب غير موجود أو لغيره: كي لا نكشف وجود طلبات الآخرين
    if (!order || order.userId !== user.id) return { ok: false, code: 'FORBIDDEN', message: 'You cannot follow this order' };
    // الطلب المنتهي لا يوجد ما يُتابَع فيه: لا اشتراك
    if (order.status === 'CANCELLED') return { ok: true, closed: true };
    await client.join(orderRoom(orderId));
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe:order')
  async unsubscribeOrder(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId?: string }): Promise<Ack> {
    if (typeof body?.orderId === 'string') await client.leave(orderRoom(body.orderId));
    return { ok: true };
  }

  // ===== الإطلاق (يُستدعى من OrdersService بعد نجاح الـ commit) — لا يرمي أخطاء أبداً =====
  emitOrderCreated(order: OrderPayload) {
    this.safely(() => this.server.to(ADMIN_ROOM).emit('order.created', order));
  }

  emitOrderStatusChanged(order: OrderPayload) {
    this.safely(() => {
      this.server.to(orderRoom(order.id)).to(ADMIN_ROOM).emit('order.status.changed', order);
      // انتهى الطلب: نلغي اشتراك الجميع من قناته
      if (order.status === 'CANCELLED') this.server.in(orderRoom(order.id)).socketsLeave(orderRoom(order.id));
    });
  }

  private safely(fn: () => void) {
    try { fn(); } catch (e) { this.logger.error(`Realtime emit failed: ${(e as Error).message}`); }
  }
}