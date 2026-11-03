import { canTransition } from './order-transitions';
import { OrderStatus } from '@prisma/client';

describe('order transition table', () => {
  it('allows only the specified forward and cancellation transitions', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED)).toBe(true);
    expect(canTransition(OrderStatus.CONFIRMED, OrderStatus.SHIPPED)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
    expect(canTransition(OrderStatus.PENDING, OrderStatus.SHIPPED)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });
});
