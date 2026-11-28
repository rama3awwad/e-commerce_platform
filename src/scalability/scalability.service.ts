import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Target = { name: string; url: string };

/** Checks each backend directly and keeps no test-run state in this process. */
@Injectable()
export class ScalabilityService {
  private readonly targets: Target[];

  constructor(config: ConfigService) {
    const raw = config.get<string>('BACKEND_INSTANCES', 'backend-1:3000,backend-2:3000,backend-3:3000');
    this.targets = raw.split(',').map((value) => value.trim()).filter(Boolean).map((hostPort) => ({
      name: hostPort.split(':')[0], url: `http://${hostPort}/api/v1/health`,
    }));
  }

  async instances() {
    const items = await Promise.all(this.targets.map(async (target) => {
      const startedAt = performance.now();
      try {
        const res = await fetch(target.url, { signal: AbortSignal.timeout(1500) });
        await res.arrayBuffer();
        return { name: target.name, status: res.ok ? 'up' : 'degraded', httpStatus: res.status,
          reportedInstance: res.headers.get('x-instance-id'), latencyMs: Math.round((performance.now() - startedAt) * 10) / 10, error: null as string | null };
      } catch (e) {
        const err = e as Error & { cause?: { code?: string } };
        return { name: target.name, status: 'down', httpStatus: null, reportedInstance: null, latencyMs: null,
          error: err.name === 'TimeoutError' ? 'timeout' : (err.cause?.code ?? err.message) };
      }
    }));
    return { checkedAt: new Date().toISOString(), servedBy: process.env.INSTANCE_ID ?? 'unknown', items };
  }
}
