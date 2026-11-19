export interface OrderCreatedEvent {
  jobId: string;
  orderId: string;
  orderNumber: number;
  userId: string;
  to: string;
  totalAmount: string;
  items: { productId: string; name: string; quantity: number; unitPrice: string }[];
  createdAt: string;
}