import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import "./scalability-dashboard.css";

const BACKENDS = ["backend-1", "backend-2", "backend-3"];
const MODULES = [
  { id: "load", title: "Load balancing", eyebrow: "01 / TRAFFIC", description: "Measure real request distribution through Nginx using backend response headers.", purpose: "Verify that healthy backend instances receive traffic through the configured load balancer." },
  { id: "failover", title: "Backend failover", eyebrow: "02 / RESILIENCE", description: "Keep safe GET probes running while you stop one backend manually.", purpose: "Observe whether the remaining backends continue serving requests." },
  { id: "recovery", title: "Backend recovery", eyebrow: "03 / RECOVERY", description: "Compare traffic before failure, during the outage, and after the backend rejoins.", purpose: "Measure actual health detection and first successful request after recovery." },
  { id: "workers", title: "Worker resilience", eyebrow: "04 / QUEUE", description: "Worker processing probes require a dedicated non-business test queue and telemetry.", purpose: "Verify that queue consumption continues while workers are stopped." },
  { id: "individual", title: "Individual worker recovery", eyebrow: "05 / WORKERS", description: "Independent worker scenarios will be enabled after safe test-message instrumentation is available.", purpose: "Prove each named worker can stop and resume without affecting the others." },
];

function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url); }
function summarize(probes = []) {
  const out = Object.fromEntries(BACKENDS.map((name) => [name, 0]));
  probes.forEach((probe) => { if (probe.instance in out) out[probe.instance] += 1; });
  const ok = probes.filter((probe) => probe.ok).length;
  return { requests: probes.length, successful: ok, failed: probes.length - ok, avg: probes.length ? probes.reduce((sum, p) => sum + p.latencyMs, 0) / probes.length : null, backends: out };
}

function ScalabilityDashboardPage() {
  const [selected, setSelected] = useState("load");
  const [requests, setRequests] = useState(500);
  const [concurrency, setConcurrency] = useState(12);
  const [endpoint, setEndpoint] = useState("/health");
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [health, setHealth] = useState({});
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState(null);
  const [message, setMessage] = useState("");
  const current = MODULES.find((item) => item.id === selected);
  const probes = run?.probes || [];
  const summary = useMemo(() => summarize(probes), [probes]);

  const refreshHistory = useCallback(() => api.get("/admin/scalability-tests/history").then((res) => setHistory(res.data.data || [])).catch(() => {}), []);
  useEffect(() => { refreshHistory(); }, [refreshHistory]);
  useEffect(() => {
    const refresh = async () => {
      const pairs = await Promise.all(BACKENDS.map(async (name) => {
        try { const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/v1/health`, { cache: "no-store" }); return [name, res.ok ? "healthy" : "unhealthy"]; }
        catch { return [name, "unavailable"]; }
      }));
      setHealth(Object.fromEntries(pairs));
    };
    refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer);
  }, []);
  async function startLoad() {
    setBusy(true); setMessage("");
    try {
      const res = await api.post("/admin/scalability-tests/load", { requests: Number(requests), concurrency: Number(concurrency), endpoint });
      const initial = res.data.data; setRun(initial);
      const controller = new AbortController(); window.activeScaleController = controller;
      let next = 0;
      const worker = async () => {
        while (!controller.signal.aborted) {
          const index = next++;
          if (index >= Number(requests)) return;
          const started = performance.now(); let probe;
          try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/v1${endpoint}`, { signal: controller.signal, cache: "no-store" });
            await response.arrayBuffer();
            probe = { at: new Date().toISOString(), ok: response.ok, status: response.status, latencyMs: performance.now() - started, instance: response.headers.get("x-instance-id"), upstream: response.headers.get("x-upstream") };
          } catch (error) {
            if (controller.signal.aborted) return;
            probe = { at: new Date().toISOString(), ok: false, status: null, latencyMs: performance.now() - started, instance: null, error: error.message };
          }
          try { const update = await api.post(`/admin/scalability-tests/${initial.id}/probes`, probe); setRun(update.data.data); }
          catch (error) { setMessage(error.message); controller.abort(); return; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(100, Math.max(1, Number(concurrency))) }, () => worker()));
      try { const final = await api.post(`/admin/scalability-tests/${initial.id}/finish`, { status: controller.signal.aborted ? "stopped" : "completed" }); setRun(final.data.data); refreshHistory(); } catch (error) { setMessage(error.message); }
      window.activeScaleController = null;
    }
    catch (err) { setMessage(err.response?.data?.message || err.message); }
    finally { setBusy(false); }
  }
  async function stopLoad() { if (!run) return; setBusy(true); try { window.activeScaleController?.abort(); const res = await api.post(`/admin/scalability-tests/${run.id}/finish`, { status: "stopped" }); setRun(res.data.data); refreshHistory(); } catch (err) { setMessage(err.message); } finally { setBusy(false); } }

  function beginScenario(id) { setScenario({ id, phase: "before", phases: {}, events: [{ at: new Date().toISOString(), text: "Monitoring started" }], detectedAt: null, recoveredAt: null, firstRecoveredAt: null }); }
  function capturePhase(phase, text) {
    if (!scenario) return;
    const observed = summarize(probes);
    setScenario((old) => ({ ...old, phase, phases: { ...old.phases, [phase]: observed }, events: [...old.events, { at: new Date().toISOString(), text }], ...(phase === "during" ? { detectedAt: new Date().toISOString() } : {}), ...(phase === "after" ? { recoveredAt: new Date().toISOString() } : {}) }));
  }
  const testRunning = run?.status === "running";
  const chartMax = Math.max(1, ...BACKENDS.map((name) => summary.backends[name]));

  return <main className="container page scale-page">
    <div className="scale-heading"><div><div className="scale-kicker">REQUIREMENT 5 · RELIABILITY LAB</div><h1 className="page-title">Scalability &amp; Fault-Tolerance Testing Dashboard</h1><p className="muted">Run bounded checks through Nginx and review evidence collected from actual responses.</p></div><div className="scale-live"><i /> LIVE MONITORING</div></div>
    <div className="scale-layout">
      <aside className="scale-sidebar card"><div className="scale-sidebar-title">TEST MODULES <span>05</span></div>{MODULES.map((item, index) => <button key={item.id} className={`scale-module ${selected === item.id ? "active" : ""}`} onClick={() => setSelected(item.id)}><span className="scale-module-num">0{index + 1}</span><span><b>{item.title}</b><small>{item.eyebrow}</small></span><span className="scale-chevron">›</span></button>)}<div className="scale-note"><b>Manual controls only</b><p>Container operations stay in Docker Desktop or PowerShell. Dashboard buttons only record your checkpoint.</p></div></aside>
      <section className="scale-content">
        <div className="scale-module-head"><div><div className="scale-kicker">{current.eyebrow}</div><h2>{current.title}</h2><p>{current.description}</p></div><span className={`scale-status ${testRunning ? "working" : run?.status || "idle"}`}><i />{testRunning ? "RUNNING" : run?.status?.toUpperCase() || "READY"}</span></div>
        {message && <div className="alert alert-error">{String(message)}</div>}
        <div className="scale-card card"><div className="scale-card-title"><span>Test configuration</span><small>{current.purpose}</small></div>
          {selected === "load" && <><div className="scale-fields"><label>Request count<input className="input" type="number" min="1" max="5000" value={requests} onChange={(e) => setRequests(e.target.value)} disabled={testRunning} /></label><label>Concurrency<input className="input" type="number" min="1" max="100" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} disabled={testRunning} /></label><label>Safe endpoint<select className="select" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={testRunning}><option value="/health">GET /health</option><option value="/products">GET /products (catalog)</option></select></label></div><div className="scale-actions"><button className="btn btn-primary" onClick={startLoad} disabled={busy || testRunning}>Start test</button><button className="btn btn-danger" onClick={stopLoad} disabled={!testRunning || busy}>Stop test</button><span className="muted">Max 5,000 requests · max concurrency 100</span></div></>}
          {["failover", "recovery"].includes(selected) && <><div className="scale-actions"><button className="btn btn-outline" onClick={() => beginScenario(selected)} disabled={Boolean(scenario) || testRunning}>Start monitoring</button><button className="btn btn-primary" onClick={startLoad} disabled={busy || testRunning}>Start probe stream</button><button className="btn btn-danger" onClick={stopLoad} disabled={!testRunning || busy}>Stop stream</button></div>{scenario && <div className="scale-checkpoint"><div className="scale-checkpoint-label">MANUAL ACTION CHECKPOINT · {scenario.phase.toUpperCase()}</div><b>{scenario.phase === "before" ? "Verify all three backends are receiving requests, then manually stop backend-2." : scenario.phase === "during" ? "Keep the probes running. When ready, manually restart backend-2." : "Recovery recorded. Continue monitoring to collect post-recovery observations."}</b><p>Container: <code>backend-2</code>. Use Docker Desktop or PowerShell; this dashboard never executes container commands.</p><div className="scale-actions"><button className="btn btn-outline btn-small" disabled={scenario.phase !== "before"} onClick={() => capturePhase("before", "Before-failure snapshot recorded")}>Record baseline</button><button className="btn btn-outline btn-small" disabled={scenario.phase !== "before"} onClick={() => capturePhase("during", "User confirmed backend-2 stopped")}>I stopped the container</button><button className="btn btn-primary btn-small" disabled={scenario.phase !== "during"} onClick={() => capturePhase("after", "User confirmed backend-2 restarted")}>I restarted the container</button><button className="btn btn-outline btn-small" onClick={() => setScenario((old) => ({ ...old, events: [...old.events, { at: new Date().toISOString(), text: "Continue monitoring confirmed" }] }))}>Continue monitoring</button></div></div>}</>}
          {["workers", "individual"].includes(selected) && <div className="scale-unavailable"><span>TELEMETRY UNAVAILABLE</span><b>Safe worker tests are not configured in this deployment.</b><p>The only worker queue, <code>order.email</code>, carries real customer email jobs. The codebase has no dedicated test queue, worker heartbeat endpoint, RabbitMQ management API credentials, or per-worker processing metrics. Publishing into the business queue could send customer email, so test execution is disabled.</p><p>Required to implement: dedicated durable test queue, worker-specific heartbeat/processed counters, and restricted RabbitMQ queue/consumer stats access.</p></div>}
        </div>
        {selected !== "load" && !["failover", "recovery"].includes(selected) ? null : <>
          <div className="scale-metrics"><Metric label="Requests observed" value={run?.metrics?.total ?? summary.requests} unit="" /><Metric label="Success rate" value={run?.metrics?.successRate?.toFixed(1) ?? (summary.requests ? (summary.successful / summary.requests * 100).toFixed(1) : "—")} unit="%" /><Metric label="Avg latency" value={run?.metrics?.averageLatencyMs?.toFixed(1) ?? (summary.avg?.toFixed(1) || "—")} unit="ms" /><Metric label="Requests / sec" value={run?.metrics?.requestsPerSecond?.toFixed(1) ?? "—"} unit="" /></div>
          <div className="scale-panels"><div className="card scale-chart"><div className="scale-card-title"><span>Backend request distribution</span><small>From X-Instance-Id response header</small></div>{BACKENDS.map((name) => <div className="scale-bar-row" key={name}><span>{name}</span><div><i style={{ width: `${Math.max(summary.backends[name] ? 3 : 0, summary.backends[name] / chartMax * 100)}%` }} /></div><b>{summary.backends[name]}</b></div>)}<div className="scale-chart-foot">Unknown instance: {probes.filter((probe) => !BACKENDS.includes(probe.instance)).length} · Values are actual responses</div></div><div className="card scale-chart"><div className="scale-card-title"><span>Recent response latency</span><small>Last 40 observations · milliseconds</small></div><div className="scale-spark">{probes.slice(-40).map((probe, index) => <i key={`${probe.at}-${index}`} title={`${probe.latencyMs} ms · ${probe.status ?? "network error"}`} className={probe.ok ? "ok" : "bad"} style={{ height: `${Math.max(5, Math.min(100, probe.latencyMs / Math.max(1, ...probes.slice(-40).map((p) => p.latencyMs)) * 100))}%` }} />)}</div><div className="scale-chart-foot">P50 {run?.metrics?.p50 ?? "Unavailable"} ms · P95 {run?.metrics?.p95 ?? "Unavailable"} ms · P99 {run?.metrics?.p99 ?? "Unavailable"} ms</div></div></div>
          <div className="scale-card card"><div className="scale-card-title"><span>Backend observations</span><small>Named identity is from actual X-Instance-Id response headers</small></div><div className="scale-backends">{BACKENDS.map((name) => { const last = [...probes].reverse().find((probe) => probe.instance === name); const state = last ? (last.ok ? "observed" : "error") : "not-seen"; return <div key={name} className="scale-backend"><span className={`scale-health ${state === "observed" ? "healthy" : state === "error" ? "unavailable" : "unknown"}`} /><b>{name}</b><span>{state === "observed" ? "responded" : state === "error" ? "request error" : "not observed"}</span><small>{summary.backends[name]} successful-identity responses</small></div>; })}</div><p className="scale-chart-foot">A backend is marked observed only after its ID appears in a measured response. Named per-instance health checks are not available through Nginx.</p></div>
          {scenario && <div className="scale-card card"><div className="scale-card-title"><span>Before / during / after comparison</span><small>Snapshots only include observations captured at each checkpoint</small></div><div className="table-wrap"><table className="table"><thead><tr><th>Metric</th><th>Before failure</th><th>During failure</th><th>After recovery</th></tr></thead><tbody>{[["Successful requests", "successful"], ["Failed requests", "failed"], ["Average latency (ms)", "avg"], ...BACKENDS.map((name) => [`${name} requests`, name])].map(([label, key]) => <tr key={key}><td>{label}</td>{["before", "during", "after"].map((phase) => <td key={phase}>{scenario.phases[phase] ? (key === "avg" ? scenario.phases[phase].avg?.toFixed(1) ?? "Unavailable" : scenario.phases[phase][key] ?? "Unavailable") : "—"}</td>)}</tr>)}</tbody></table></div><ul className="scale-events">{scenario.events.map((event, i) => <li key={i}><time>{new Date(event.at).toLocaleTimeString()}</time>{event.text}</li>)}</ul></div>}
        </>}
        <div className="scale-card card"><div className="scale-card-title"><span>Test results &amp; history</span><div className="scale-actions"><button className="btn btn-outline btn-small" disabled={!run} onClick={() => download(`scalability-${run.id}.json`, JSON.stringify({ ...run, scenario }, null, 2), "application/json")}>Export JSON</button><button className="btn btn-outline btn-small" disabled={!run} onClick={() => { const rows = run.probes || []; download(`scalability-${run.id}.csv`, ["timestamp,success,status,latency_ms,instance,error", ...rows.map((p) => [p.at, p.ok, p.status ?? "", p.latencyMs, p.instance ?? "", JSON.stringify(p.error || "")].join(","))].join("\n"), "text/csv"); }}>Export CSV</button></div></div>{run && <p className="scale-run-time">Started {new Date(run.startedAt).toLocaleString()} · {run.endedAt ? `Ended ${new Date(run.endedAt).toLocaleString()}` : "In progress"} · {run.status}</p>}{history.length ? history.slice(0, 5).map((item) => <button className="scale-history-row" key={item.id} onClick={() => setRun(item)}><span><b>{item.kind}</b><small>{new Date(item.startedAt).toLocaleString()}</small></span><span>{item.metrics?.total || 0} requests</span><span className={`scale-status ${item.status}`}>{item.status}</span></button>) : <p className="muted">No completed load runs yet. Results are kept in backend memory and reset when the backend restarts.</p>}</div>
      </section>
    </div>
  </main>;
}

function Metric({ label, value, unit }) { return <div className="scale-metric card"><span>{label}</span><b>{value}<small>{unit}</small></b></div>; }
export default ScalabilityDashboardPage;
