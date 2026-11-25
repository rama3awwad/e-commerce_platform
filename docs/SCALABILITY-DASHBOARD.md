# Scalability & Fault-Tolerance Dashboard

## Route and access

Open `/admin/scalability` while signed in as an administrator. The API is mounted at `/api/v1/admin/scalability-tests` and requires the existing administrator JWT guard.

## Run the application

From the repository root, start the existing compose stack with `docker compose up --build -d`. Start the frontend from `frontend` with `npm install` once and `npm run dev`; open the Vite URL and sign in with an administrator account. The dashboard calls the public API origin configured by `VITE_API_URL` (defaults to `http://localhost:3000`), which is the Nginx load balancer in the compose setup.

## Load balancing

Choose `GET /health` or `GET /products`, configure 1–5,000 requests and concurrency 1–100, then start the test. Every measured request is issued by the browser to the configured public API origin. Status, latency, timestamp, `X-Instance-Id`, and `X-Upstream` are captured from each response. The API stores run history in memory; it is cleared when all backend processes restart. A run that does not observe all three IDs is evidence of that distribution, not a fabricated pass.

## Backend failover and recovery

Start monitoring and a probe stream. Record the baseline after seeing all healthy backends receive probes. Use Docker Desktop or PowerShell to stop `backend-2`, then select **I stopped the container**. Continue probes while it is unavailable. Restart `backend-2` manually and select **I restarted the container** after it is running. Health polling observes the public Nginx health endpoint; the request distribution and comparisons use actual probe responses. Dashboard buttons only record the user's action.

Manual PowerShell commands from the repository root:

```powershell
docker compose stop backend-2
docker compose start backend-2
```

## Worker scenarios: unavailable

Worker execution is intentionally disabled. The configured `order.email` queue contains real customer email jobs, and the repository does not configure a separate test queue, worker heartbeats, per-worker processing telemetry, or a queue-stats API. Do not publish test messages to `order.email`. The existing RabbitMQ management port alone is not enough to safely identify application-level worker processing through the authenticated application dashboard. Implementing the worker modules requires a dedicated durable test queue and isolated worker test instrumentation first.

## Collected values and limitations

- Load balancing: totals, successes, failures, success rate, throughput, average and percentile latency, and per-instance counts are computed from recorded responses.
- Backend health: direct browser probes to the public `/api/v1/health` URL indicate whether Nginx can serve a health request; they do not prove the health of each backend separately.
- Nginx's `X-Upstream` header is available on actual probe responses when CORS exposes it; the current response list may identify unknown instance when a request fails before receiving a backend response.
- Worker consumer counts, ready/unacknowledged depth, redeliveries, worker identity, processing counters, and worker recovery duration are unavailable until safe test queue instrumentation is added.
- Results persist only in backend process memory. JSON and CSV downloads are available in the dashboard.
