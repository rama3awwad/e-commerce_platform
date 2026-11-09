import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../../common/internal-http/internal-http.client';
import { ProductsApi, ProductSummaryDto } from '../../products/api/products.api';
@Injectable() export class HttpProductsApi extends ProductsApi {private readonly config:ConfigService;constructor(private readonly client:InternalHttpClient,c:ConfigService){super();this.config=c} private get url(){return this.config.get('PRODUCTS_API_URL',`http://localhost:${this.config.get('PORT','3000')}/api/v1`)} findActiveByIds(ids:string[]):Promise<ProductSummaryDto[]>{return this.client.request('POST',`${this.url}/internal/products/by-ids`,{ids})}}
