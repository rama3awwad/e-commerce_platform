SET statement_timeout = '30000';

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT i.*
FROM orders.order_items i
WHERE i."orderId" IN (
  SELECT o.id
  FROM orders.orders o
  WHERE o."userId" = 'bfe1c949-8708-481e-99ef-e23254ba073a'
  ORDER BY o."createdAt" DESC
  LIMIT 20
);
