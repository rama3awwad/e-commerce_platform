import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../../common/internal-http/internal-http.client';
import { OrdersApi } from '../../orders/api/orders.api';
@Injectable() export class HttpOrdersApi extends OrdersApi {private readonly config:ConfigService;constructor(private readonly client:InternalHttpClient,c:ConfigService){super();this.config=c} private get url(){return this.config.get('ORDERS_API_URL',`http://localhost:${this.config.get('PORT','3000')}/api/v1`)} async userHasOrders(userId:string){const r=await this.client.request<{hasOrders:boolean}>('GET',`${this.url}/internal/orders/users/${userId}/has-orders`);return r.hasOrders}}
