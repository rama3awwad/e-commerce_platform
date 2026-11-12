-- Requirement 3: product search uses name ILIKE '%term%' (leading wildcard).
-- A normal B-tree index on name cannot serve it, so PostgreSQL scans and filters every row.
-- A trigram GIN index splits names into 3-letter pieces and can answer ILIKE with a wildcard on both sides.
-- Trade-off: writes to products become slightly slower and the index takes extra disk space.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);
