import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError, AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalHttpClient {
  private readonly logger = new Logger(InternalHttpClient.name);
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(private readonly http: HttpService, config: ConfigService) {
    this.token = config.get<string>('INTERNAL_API_TOKEN', '');
    this.timeoutMs = Number(config.get<string>('INTERNAL_API_TIMEOUT_MS', '3000'));
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown): Promise<T> {
    const startedAt = Date.now();
    try {
      const cfg: AxiosRequestConfig = { headers: { 'X-Internal-Token': this.token }, timeout: this.timeoutMs };
      const res = await firstValueFrom(this.http.request({ method, url, data: body, ...cfg }));
      this.logger.log(`Internal HTTP ${method} completed in ${Date.now() - startedAt}ms`);
      return (res.data?.data ?? res.data) as T;
    } catch (error) {
      const e = error as AxiosError;
      const status = e.response?.status;
      this.logger.error(`Internal HTTP ${method} failed after ${Date.now() - startedAt}ms (status=${status ?? 'none'}, code=${e.code ?? 'unknown'})`);
      if (status === 404 || (status && status < 500)) throw error;
      throw new ServiceUnavailableException('Internal service is temporarily unavailable');
    }
  }
}
