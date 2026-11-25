import { ConflictException, Injectable } from '@nestjs/common';

type Probe = { at: string; ok: boolean; status: number | null; latencyMs: number; instance: string | null; error?: string };
type Run = { id: string; kind: string; endpoint: string; startedAt: string; endedAt?: string; status: 'running' | 'completed' | 'stopped' | 'failed'; probes: Probe[]; error?: string };

const ALLOWED_ENDPOINTS = ['/health', '/products'];

@Injectable()
export class ScalabilityService {
  private readonly runs = new Map<string, Run>();
  private activeRunId?: string;

  startLoad(input: { requests: number; concurrency: number; endpoint: string }) {
    if (this.activeRunId) throw new ConflictException('A scalability test is already running');
    const endpoint = input.endpoint || '/health';
    if (!ALLOWED_ENDPOINTS.includes(endpoint)) throw new ConflictException('Only safe GET probe endpoints are allowed');
    if (!Number.isInteger(input.requests) || input.requests < 1 || input.requests > 5000) throw new ConflictException('Requests must be between 1 and 5000');
    if (!Number.isInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > 100) throw new ConflictException('Concurrency must be between 1 and 100');
    const run: Run = { id: `browser-${Date.now()}`, kind: 'load-balancing', endpoint, startedAt: new Date().toISOString(), status: 'running', probes: [] };
    this.runs.set(run.id, run);
    this.activeRunId = run.id;
    (run as Run & { config?: unknown }).config = { requests: input.requests, concurrency: input.concurrency };
    return this.snapshot(run);
  }

  record(id: string, probe: Probe) {
    const run = this.runs.get(id);
    if (!run || run.status !== 'running') return null;
    if (!Number.isFinite(probe.latencyMs) || probe.latencyMs < 0 || typeof probe.ok !== 'boolean') return null;
    run.probes.push({ ...probe, latencyMs: Math.round(probe.latencyMs * 100) / 100 });
    return this.snapshot(run);
  }
  finish(id: string, status: 'completed' | 'stopped') {
    const run = this.runs.get(id);
    if (!run) return null;
    if (run.status === 'running') { run.status = status; run.endedAt = new Date().toISOString(); }
    if (this.activeRunId === id) this.activeRunId = undefined;
    return this.snapshot(run);
  }

  stop(id: string) {
    const run = this.runs.get(id);
    if (!run) return null;
    if (run.status === 'running') { run.status = 'stopped'; run.endedAt = new Date().toISOString(); }
    if (this.activeRunId === id) this.activeRunId = undefined;
    return this.snapshot(run);
  }

  get(id: string) { const run = this.runs.get(id); return run ? this.snapshot(run) : null; }
  history() { return [...this.runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map((run) => this.snapshot(run)); }

  private snapshot(run: Run) {
    const counts: Record<string, number> = { 'backend-1': 0, 'backend-2': 0, 'backend-3': 0, unknown: 0 };
    const latencies = run.probes.map((probe) => probe.latencyMs).sort((a, b) => a - b);
    for (const probe of run.probes) counts[probe.instance && probe.instance in counts ? probe.instance : 'unknown']++;
    const successful = run.probes.filter((probe) => probe.ok).length;
    const percentile = (p: number) => latencies.length ? latencies[Math.max(0, Math.ceil(p * latencies.length) - 1)] : null;
    const elapsed = Math.max(0.001, ((run.endedAt ? Date.parse(run.endedAt) : Date.now()) - Date.parse(run.startedAt)) / 1000);
    return { ...run, probes: run.probes.slice(-1000), metrics: { total: run.probes.length, successful, failed: run.probes.length - successful, successRate: run.probes.length ? successful / run.probes.length * 100 : 0, requestsPerSecond: run.probes.length / elapsed, averageLatencyMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null, p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), backends: counts } };
  }
}
