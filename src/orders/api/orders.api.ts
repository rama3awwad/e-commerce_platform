export abstract class OrdersApi { abstract userHasOrders(userId: string): Promise<boolean>; }
