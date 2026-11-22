import { Body, Controller, ForbiddenException, HttpCode, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../common/enums/role.enum';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrdersPrismaService } from '../prisma/orders-prisma.service';
import { RealtimeAuthDto } from './realtime-auth.dto';
import { ADMIN_CHANNEL, ORDER_CHANNEL_PREFIX, PusherService } from './pusher.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const forbidden = (code: string, message: string) => new ForbiddenException({ code, message });

/**
 * المتطلب الرابع (الصلاحيات): لا أحد يشترك بقناة قبل أن يمرّ من هنا.
 * المتصفح يرسل JWT مع socket_id واسم القناة، فنتحقق من هوية المستخدم (JwtAuthGuard) ثم من حقّه بهذه القناة بالذات:
 *   private-admin.orders  => للمسؤول فقط
 *   private-order.{id}    => لصاحب الطلب فقط (وطلب ملغى لا يُتابَع)
 * الرد الناجح هو توقيع Soketi؛ والرد المرفوض 403 فيرفض Soketi الاشتراك.
 */
@ApiTags('realtime')
@Controller('realtime')
export class RealtimeAuthController {
  constructor(private readonly pusher: PusherService, private readonly prisma: OrdersPrismaService) {}

  // @Res: pusher-js يتوقع { auth } مباشرة، بدون غلاف { success, data } الذي يضيفه TransformInterceptor
  @Post('auth') @HttpCode(200) @Auth()
  @ApiOperation({ summary: 'Authorize a private real-time channel (called by pusher-js, not by hand)' })
  async authorize(@CurrentUser() user: { id: string; role: Role }, @Body() dto: RealtimeAuthDto, @Res() res: Response) {
    await this.assertCanSubscribe(user, dto.channel_name);
    res.status(200).json(this.pusher.authorizeChannel(dto.socket_id, dto.channel_name));
  }

  private async assertCanSubscribe(user: { id: string; role: Role }, channel: string): Promise<void> {
    if (channel === ADMIN_CHANNEL) {
      if (user.role !== Role.ADMIN) throw forbidden('FORBIDDEN', 'Only administrators can subscribe to the admin channel');
      return;
    }
    if (channel.startsWith(ORDER_CHANNEL_PREFIX)) {
      const orderId = channel.slice(ORDER_CHANNEL_PREFIX.length);
      if (!UUID.test(orderId)) throw forbidden('FORBIDDEN', 'You cannot follow this order');
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, status: true } });
      // نفس الرد لو الطلب غير موجود أو لغيره: كي لا نكشف وجود طلبات الآخرين
      if (!order || order.userId !== user.id) throw forbidden('FORBIDDEN', 'You cannot follow this order');
      // الطلب الملغى لا يوجد ما يُتابَع فيه (Pusher لا يسمح للسيرفر بطرد مشترك، فنمنع الاشتراك الجديد)
      if (order.status === 'CANCELLED') throw forbidden('ORDER_CLOSED', 'This order is closed, there is nothing left to follow');
      return;
    }
    throw forbidden('FORBIDDEN', 'Unknown channel');
  }
}