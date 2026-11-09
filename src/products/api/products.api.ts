export interface ProductSummaryDto { id: string; name: string; price: string }
export abstract class ProductsApi { abstract findActiveByIds(ids: string[]): Promise<ProductSummaryDto[]>; }
