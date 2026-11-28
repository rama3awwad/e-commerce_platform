-- psql -U postgres -d ecommerce_db -v pid=<PRODUCT_UUID> -v since='2026-11-26 00:00:00' -f -
-- (الجداول داخل schemas: orders)

\echo '== 1) email_jobs by status =='
SELECT status, count(*) FROM orders.email_jobs WHERE "createdAt" >= :'since' GROUP BY status ORDER BY status;

\echo '== 2) SENT emails by worker (work distribution) =='
SELECT "processedBy", count(*) FROM orders.email_jobs WHERE status = 'SENT' AND "createdAt" >= :'since' GROUP BY 1 ORDER BY 1;

\echo '== 3) orders without an email job (expected 0) =='
SELECT count(*) AS orders_without_job
FROM orders.orders o LEFT JOIN orders.email_jobs j ON j."orderId" = o.id
WHERE j.id IS NULL AND o."createdAt" >= :'since';

\echo '== 4) jobs stuck in QUEUED/RETRYING for > 2 min (expected 0 once workers finish) =='
SELECT count(*) AS stuck FROM orders.email_jobs
WHERE status IN ('QUEUED', 'RETRYING') AND "createdAt" >= :'since' AND "createdAt" < now() - interval '2 minutes';

\echo '== 5) orders and units for the product (non-cancelled) =='
SELECT count(DISTINCT oi."orderId") AS orders_count, coalesce(sum(oi.quantity), 0) AS units_sold
FROM orders.order_items oi JOIN orders.orders o ON o.id = oi."orderId"
WHERE oi."productId" = :'pid' AND o.status <> 'CANCELLED' AND o."createdAt" >= :'since';