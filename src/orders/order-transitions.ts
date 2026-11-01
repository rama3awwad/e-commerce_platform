import { OrderStatus } from '@prisma/client';
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export const canTransition = (current: OrderStatus, requested: OrderStatus) => ORDER_TRANSITIONS[current].includes(requested);
