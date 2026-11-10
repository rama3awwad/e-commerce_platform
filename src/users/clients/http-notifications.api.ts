import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalHttpClient } from '../../common/internal-http/internal-http.client';
import { NotificationsApi } from '../../notifications/api/notifications.api';
@Injectable() export class HttpNotificationsApi extends NotificationsApi {private readonly config:ConfigService;constructor(private readonly client:InternalHttpClient,c:ConfigService){super();this.config=c} private get url(){return this.config.get('NOTIFICATIONS_API_URL',`http://localhost:${this.config.get('PORT','3000')}/api/v1`)} notify(input:{userId:string;type:string;title:string;message:string}){return this.client.request('POST',`${this.url}/internal/notifications`,input).then(()=>undefined)} deleteAllForUser(userId:string){return this.client.request('DELETE',`${this.url}/internal/notifications/users/${userId}`).then(()=>undefined)}}
