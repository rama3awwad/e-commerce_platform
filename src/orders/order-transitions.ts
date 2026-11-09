import { OrderStatus } from '.prisma/orders-client';
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = { PENDING:['CONFIRMED','CANCELLED'], CONFIRMED:['CANCELLED'], CANCELLED:[] };
export const canTransition=(current:OrderStatus,requested:OrderStatus)=>ORDER_TRANSITIONS[current].includes(requested);
