-- Requirement 3 — EXPLAIN ANALYZE on the slow queries.
-- Run against the primary database:
--   docker compose exec -T db psql -U postgres -d ecommerce_db -f - < scripts/explain.sql

-- 1) GET /orders: items of the 20 newest orders of the heaviest user.
--    Without the order_items("orderId") index:  Seq Scan over ~900k rows.
--    With the index:                            Index Scan, a few rows.
EXPLAIN (ANALYZE, BUFFERS)
SELECT i.*
FROM orders.order_items i
WHERE i."orderId" IN (
  SELECT o.id
  FROM orders.orders o
  WHERE o."userId" = (SELECT "userId" FROM orders.orders GROUP BY "userId" ORDER BY count(*) DESC LIMIT 1)
  ORDER BY o."createdAt" DESC
  LIMIT 20
);

-- 2) GET /products?search=...: name search with a wildcard on both sides (what Prisma
--    "contains, insensitive" generates). The normal B-tree index on name cannot serve '%...%'.
--    Without products_name_trgm_idx: Seq Scan over every product + Filter.
--    With the trigram index:         Bitmap Index Scan on products_name_trgm_idx.
EXPLAIN (ANALYZE, BUFFERS)
SELECT p.*
FROM products.products p
WHERE p."isActive" = true
  AND p.name ILIKE '%searchterm42%'
ORDER BY p."createdAt" DESC
LIMIT 20;
