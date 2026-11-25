import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../api/client";
import "./scalability-dashboard.css";

const API_ORIGIN = import.meta.env.VITE_API_URL || "http://localhost:3000";
const BACKENDS = ["backend-1", "backend-2", "backend-3"];
const MODULES = [
  { id: "load", title: "Load balancing", eyebrow: "01 / TRAFFIC", description: "Measure how Nginx distributes real requests, using the X-Instance-Id response header.", purpose: "Verify that every healthy backend instance receives traffic." },
  { id: "failover", title: "Failover & recovery", eyebrow: "02 / RESILIENCE", description: "Keep a probe stream running while you stop and restart one backend manually.", purpose: "Compare traffic before, during and after the outage." },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
const fmt = (value, digits = 1) => (value === null || value === undefined ? "—" : Number(value).toFixed(digits));

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

function summarize(probes) {
  const backends = Object.fromEntries(BACKENDS.map((name) => [name, 0]));
  const byStatus = {};
  let ok = 0;
  let unknown = 0;
  for (const p of probes) {
    if (p.ok) ok += 1;
    const key = p.status ?? "network";
    byStatus[key] = (byStatus[key] || 0) + 1;
    if (p.instance && p.instance in backends) backends[p.instance] += 1; else unknown += 1;
  }
  const lat = probes.map((p) => p.latencyMs).sort((a, b) => a - b);
  const pick = (q) => (lat.length ? lat[Math.max(0, Math.ceil(q * lat.length) - 1)] : null);
  return {
    requests: probes.length, ok, failed: probes.length - ok, backends, unknown, byStatus,
    avg: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null,
    p50: pick(0.5), p95: pick(0.95), p99: pick(0.99),
  };
}

function Metric({ label, value, unit }) {
  return <div className="scale-metric card"><span>{label}</span><b>{value}<small>{unit}</small></b></div>;
}

function ScalabilityDashboardPage() {
  const [selected, setSelected] = useState("load");
  const [requests, setRequests] = useState(500);
  const [concurrency, setConcurrency] = useState(12);
  const [endpoint, setEndpoint] = useState("/health");
  const [probes, setProbes] = useState([]);
  const [running, setRunning] = useState(false);
  const [timing, setTiming] = useState({ startedAt: null, endedAt: null });
  const [instances, setInstances] = useState(null);
  const [target, setTarget] = useState("backend-2");
  const [scenario, setScenario] = useState(null);
  const [message, setMessage] = useState("");
  const bufferRef = useRef([]);
  const controllerRef = useRef(null);

  const current = MODULES.find((m) => m.id === selected);
  const summary = useMemo(() => summarize(probes), [probes]);
  const chartMax = Math.max(1, ...BACKENDS.map((name) => summary.backends[name]));
  const elapsedSec = timing.startedAt && timing.endedAt ? (timing.endedAt - timing.startedAt) / 1000 : null;

  // حالة كل نسخة تأتي من السيرفر (يفحص كل backend مباشرة داخل شبكة Docker)
  useEffect(() => {
    let ignore = false;
    function load() {
      api.get("/admin/scalability/instances")
        .then((res) => { if (!ignore) setInstances(res.data.data); })
        .catch((err) => { if (!ignore) setInstances({ error: err.message }); });
    }
    load();
    const timer = setInterval(load, 4000);
    return () => { ignore = true; clearInterval(timer); };
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function startLoad() {
    if (controllerRef.current) return;
    const total = clamp(requests, 1, 5000);
    const workers = clamp(concurrency, 1, 100);
    const controller = new AbortController();
    controllerRef.current = controller;
    bufferRef.current = [];
    setProbes([]); setMessage(""); setRunning(true);
    setTiming({ startedAt: Date.now(), endedAt: null });

    const flush = () => {
      if (!bufferRef.current.length) return;
      const chunk = bufferRef.current;
      bufferRef.current = [];
      setProbes((old) => old.concat(chunk));
    };
    const timer = setInterval(flush, 250);
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: "Bearer " + token } : {};
    let next = 0;

    const worker = async () => {
      while (!controller.signal.aborted && next < total) {
        next += 1;
        const t0 = performance.now();
        let probe;
        try {
          const res = await fetch(`${API_ORIGIN}/api/v1${endpoint}`, { headers, cache: "no-store", signal: controller.signal });
          await res.arrayBuffer();
          probe = { at: Date.now(), ok: res.ok, status: res.status, latencyMs: performance.now() - t0, instance: res.headers.get("x-instance-id") };
        } catch (error) {
          if (controller.signal.aborted) return;
          probe = { at: Date.now(), ok: false, status: null, latencyMs: performance.now() - t0, instance: null, error: error.message };
        }
        bufferRef.current.push(probe);
      }
    };

    await Promise.all(Array.from({ length: workers }, worker));
    clearInterval(timer);
    flush();
    controllerRef.current = null;
    setRunning(false);
    setTiming((old) => ({ ...old, endedAt: Date.now() }));
  }

  function stopLoad() { controllerRef.current?.abort(); }

  // ---- سيناريو failover: كل مرحلة تُحسب من نقطة بدايتها فقط (ليست تراكمية) ----
  function beginScenario() {
    setScenario({ target, phase: "before", marks: { before: { idx: probes.length, at: Date.now() } }, events: [{ at: Date.now(), text: "Monitoring started (baseline)" }] });
  }
  function mark(phase, text) {
    setScenario((old) => ({ ...old, phase, marks: { ...old.marks, [phase]: { idx: probes.length, at: Date.now() } }, events: [...old.events, { at: Date.now(), text }] }));
  }

  const phaseStats = useMemo(() => {
    if (!scenario) return null;
    const m = scenario.marks;
    return {
      before: m.before ? summarize(probes.slice(m.before.idx, m.during ? m.during.idx : undefined)) : null,
      during: m.during ? summarize(probes.slice(m.during.idx, m.after ? m.after.idx : undefined)) : null,
      after: m.after ? summarize(probes.slice(m.after.idx)) : null,
    };
  }, [scenario, probes]);

  // الزمن من لحظة "أعدتُ التشغيل" حتى أول طلب ناجح خدمته النسخة نفسها
  const recoverySeconds = useMemo(() => {
    if (!scenario || !scenario.marks.after) return null;
    const first = probes.slice(scenario.marks.after.idx).find((p) => p.ok && p.instance === scenario.target);
    return first ? (first.at - scenario.marks.after.at) / 1000 : null;
  }, [scenario, probes]);

  const statusText = (s) => Object.entries(s.byStatus).map(([code, n]) => `${code}: ${n}`).join(" · ") || "—";
  const streamActive = running;

  return (
    <main className="container page scale-page">
      <div className="scale-heading">
        <div>
          <div className="scale-kicker">REQUIREMENT 5 · RELIABILITY LAB</div>
          <h1 className="page-title">Scalability &amp; Fault-Tolerance Dashboard</h1>
          <p className="muted">Bounded checks through Nginx. Every number comes from real responses; the server keeps no test state.</p>
        </div>
        <div className="scale-live"><i /> LIVE MONITORING</div>
      </div>

      <div className="scale-layout">
        <aside className="scale-sidebar card">
          <div className="scale-sidebar-title">TEST MODULES <span>0{MODULES.length}</span></div>
          {MODULES.map((item, index) => (
            <button key={item.id} className={`scale-module ${selected === item.id ? "active" : ""}`} onClick={() => setSelected(item.id)}>
              <span className="scale-module-num">0{index + 1}</span>
              <span><b>{item.title}</b><small>{item.eyebrow}</small></span>
              <span className="scale-chevron">›</span>
            </button>
          ))}
          <div className="scale-note">
            <b>Workers &amp; emails</b>
            <p>Per-worker processing and queue consumers are shown on <Link to="/admin/async-monitor">the email monitor</Link>. Container stop/start stays manual (Docker Desktop or PowerShell).</p>
          </div>
        </aside>

        <section className="scale-content">
          <div className="scale-module-head">
            <div><div className="scale-kicker">{current.eyebrow}</div><h2>{current.title}</h2><p>{current.description}</p></div>
            <span className={`scale-status ${running ? "working" : "idle"}`}><i />{running ? "RUNNING" : "READY"}</span>
          </div>
          {message && <div className="alert alert-error">{message}</div>}

          <div className="scale-card card">
            <div className="scale-card-title"><span>Probe stream</span><small>{current.purpose}</small></div>
            <div className="scale-fields">
              <label>Request count<input className="input" type="number" min="1" max="5000" value={requests} onChange={(e) => setRequests(e.target.value)} disabled={running} /></label>
              <label>Concurrency<input className="input" type="number" min="1" max="100" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} disabled={running} /></label>
              <label>Endpoint<select className="select" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} disabled={running}><option value="/health">GET /health</option><option value="/products">GET /products</option></select></label>
            </div>
            <div className="scale-actions">
              <button className="btn btn-primary" onClick={startLoad} disabled={running || Boolean(scenario)}>Start stream</button>
              <button className="btn btn-danger" onClick={stopLoad} disabled={!running}>Stop</button>
              <span className="muted">Tip: start the stack with THROTTLE_LIMIT=100000, otherwise 429 appears (which also proves the shared limiter).</span>
            </div>
          </div>

          <div className="scale-card card">
            <div className="scale-card-title"><span>Backend instances</span><small>Checked server-side, one by one</small></div>
            <div className="scale-backends">
              {instances && instances.items ? instances.items.map((item) => (
                <div key={item.name} className="scale-backend">
                  <span className={`scale-health ${item.status === "up" ? "healthy" : item.status === "degraded" ? "unknown" : "unavailable"}`} />
                  <b>{item.name}</b>
                  <span>{item.status}{item.latencyMs !== null ? ` · ${item.latencyMs} ms` : ""}</span>
                  <small>{item.error ? `error: ${item.error}` : `reports: ${item.reportedInstance || "?"}`}</small>
                </div>
              )) : <p className="muted">{instances && instances.error ? `Could not load instances: ${instances.error}` : "Loading..."}</p>}
            </div>
            {instances && instances.servedBy && <p className="scale-chart-foot">This check was served by {instances.servedBy} · refreshed every 4 s</p>}
          </div>

          <div className="scale-metrics">
            <Metric label="Requests observed" value={summary.requests} unit="" />
            <Metric label="Success rate" value={summary.requests ? fmt(summary.ok / summary.requests * 100) : "—"} unit="%" />
            <Metric label="Avg latency" value={fmt(summary.avg)} unit="ms" />
            <Metric label="Requests / sec" value={elapsedSec ? fmt(summary.requests / elapsedSec) : "—"} unit="" />
          </div>

          <div className="scale-panels">
            <div className="card scale-chart">
              <div className="scale-card-title"><span>Backend request distribution</span><small>From X-Instance-Id</small></div>
              {BACKENDS.map((name) => (
                <div className="scale-bar-row" key={name}>
                  <span>{name}</span>
                  <div><i style={{ width: `${Math.max(summary.backends[name] ? 3 : 0, summary.backends[name] / chartMax * 100)}%` }} /></div>
                  <b>{summary.backends[name]}</b>
                </div>
              ))}
              <div className="scale-chart-foot">Unknown instance: {summary.unknown} · Status codes: {statusText(summary)}</div>
            </div>
            <div className="card scale-chart">
              <div className="scale-card-title"><span>Latency percentiles</span><small>milliseconds</small></div>
              <div className="scale-bar-row"><span>P50</span><div /><b>{fmt(summary.p50)}</b></div>
              <div className="scale-bar-row"><span>P95</span><div /><b>{fmt(summary.p95)}</b></div>
              <div className="scale-bar-row"><span>P99</span><div /><b>{fmt(summary.p99)}</b></div>
            </div>
          </div>

          {selected === "failover" && (
            <div className="scale-card card">
              <div className="scale-card-title"><span>Failover checkpoints</span><small>Manual container actions; buttons only record your checkpoint</small></div>
              <div className="scale-fields">
                <label>Backend to stop<select className="select" value={target} onChange={(e) => setTarget(e.target.value)} disabled={Boolean(scenario)}>{BACKENDS.map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
              </div>
              <div className="scale-actions">
                <button className="btn btn-outline btn-small" onClick={beginScenario} disabled={!streamActive || Boolean(scenario)}>1. Start baseline</button>
                <button className="btn btn-outline btn-small" onClick={() => mark("during", `User stopped ${scenario.target}`)} disabled={!scenario || scenario.phase !== "before"}>2. I stopped it</button>
                <button className="btn btn-primary btn-small" onClick={() => mark("after", `User restarted ${scenario.target}`)} disabled={!scenario || scenario.phase !== "during"}>3. I restarted it</button>
                <button className="btn btn-outline btn-small" onClick={() => setScenario(null)} disabled={!scenario}>Reset</button>
              </div>
              <div className="scale-checkpoint">
                <div className="scale-checkpoint-label">COMMANDS (PowerShell, repo root)</div>
                <p><code>docker compose stop {target}</code> then, after restarting: <code>docker compose start {target}</code> followed by <code>docker compose exec lb nginx -s reload</code></p>
                <p className="muted">Nginx resolves backend addresses at startup, so reload it after a restart if the container got a new IP. Start the stream first (large request count, e.g. 3000), then begin the baseline.</p>
              </div>
              {phaseStats && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Metric</th><th>Before</th><th>During outage</th><th>After recovery</th></tr></thead>
                    <tbody>
                      {[["Requests", (s) => s.requests], ["Successful", (s) => s.ok], ["Failed", (s) => s.failed], ["Avg latency (ms)", (s) => fmt(s.avg)], ...BACKENDS.map((n) => [`${n} served`, (s) => s.backends[n]])].map(([label, get]) => (
                        <tr key={label}><td>{label}</td>{["before", "during", "after"].map((p) => <td key={p}>{phaseStats[p] ? get(phaseStats[p]) : "—"}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {phaseStats && phaseStats.during && (
                <p className="scale-chart-foot">
                  Verdict: {scenario.target} served {phaseStats.during.backends[scenario.target]} request(s) during the outage (expected 0) · failed during outage: {phaseStats.during.failed}
                  {recoverySeconds !== null ? ` · first response from ${scenario.target} ${fmt(recoverySeconds)} s after restart` : ""}
                </p>
              )}
              {scenario && <ul className="scale-events">{scenario.events.map((e, i) => <li key={i}><time>{new Date(e.at).toLocaleTimeString()}</time>{e.text}</li>)}</ul>}
            </div>
          )}

          <div className="scale-card card">
            <div className="scale-card-title">
              <span>Export</span>
              <div className="scale-actions">
                <button className="btn btn-outline btn-small" disabled={!probes.length} onClick={() => download("scalability-run.json", JSON.stringify({ config: { requests, concurrency, endpoint }, summary, scenario, phaseStats, recoverySeconds, probes }, null, 2), "application/json")}>Export JSON</button>
                <button className="btn btn-outline btn-small" disabled={!probes.length} onClick={() => download("scalability-run.csv", ["timestamp,success,status,latency_ms,instance,error", ...probes.map((p) => [new Date(p.at).toISOString(), p.ok, p.status ?? "", p.latencyMs.toFixed(2), p.instance ?? "", JSON.stringify(p.error || "")].join(","))].join("\n"), "text/csv")}>Export CSV</button>
              </div>
            </div>
            <p className="muted">Results live in this browser tab only (nothing is stored on the servers). Export before closing the tab and keep the files as evidence.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default ScalabilityDashboardPage;