# Scalability & Fault-Tolerance Dashboard

## Route and access

Open `/admin/scalability` while signed in as an administrator. Its API is mounted at `/api/v1/admin/scalability` and requires the administrator JWT guard.

## Run the application

From the repository root, start the compose stack with `docker compose up --build -d`. Start the frontend from `frontend` with `npm run dev`; open the Vite URL and sign in as an administrator. The dashboard uses the public API origin configured by `VITE_API_URL` (defaults to `http://localhost:3000`) and sends measured requests through Nginx.

## Load balancing

Choose `GET /health` or `GET /products`, configure 1–5,000 requests and concurrency 1–100, then start the test. The browser records status, latency, timestamp, and `X-Instance-Id` from real responses. Test results are computed in the browser and exported as JSON/CSV; the server keeps no test state so requests can reach any backend instance.

## Backend failover and recovery

Keep a probe stream running. Record the baseline, stop `backend-2`, record the outage, restart it, and record recovery. The dashboard compares responses from each phase and polls `GET /api/v1/admin/scalability/instances`, which probes each backend directly over the Docker network. Dashboard buttons record the operator's checkpoints; they do not control containers.

```powershell
docker compose stop backend-2
docker compose start backend-2
docker compose exec lb nginx -s reload
```

Nginx resolves backend addresses at startup, so reload it after a restarted container receives a new IP.

## Worker evidence

The email monitor at `/admin/async-monitor` shows the `processedBy` worker recorded for each email job, the number of jobs last processed by each worker, and the live consumer count and queue depth from RabbitMQ's management API. A job records its most recent processing worker, not a full per-attempt audit trail.

## Collected values and limitations

- Load balancing: requests, successes, failures, success rate, throughput, average and percentile latency, and per-instance counts come from measured responses.
- Backend health is checked separately for each backend from inside the Docker network.
- Unknown instance counts include requests that failed before a backend response was available.
- Dashboard results remain in the browser tab. Export JSON/CSV before closing it.
- PostgreSQL, Redis, RabbitMQ, and inventory are shared services and can limit throughput.
