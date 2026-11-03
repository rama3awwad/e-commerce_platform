# E-Commerce Platform API (Requirement 1)

NestJS 10 + Prisma 6 + PostgreSQL 16 REST API for a small e-commerce platform. This delivery covers authentication, user administration, products/categories, orders, notifications, and an inventory adapter seam. The inventory is an in-memory demo adapter; the separate gRPC microservice belongs to Requirement 2 and is not implemented here.

## Run with Docker

Copy the sample environment and start the application:

```sh
cp .env.example .env
docker compose up --build
```

The API listens on `http://localhost:3000`; health check is `http://localhost:3000/api/v1/health`; Swagger is `http://localhost:3000/api/docs`. The database is private to the Compose network. Product files are stored in the named `uploads` volume and served at `/uploads/<random-name>`. To enable local database port access and pgAdmin for development only, run `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` (pgAdmin: port 5050; set `PGADMIN_PASSWORD` in `.env`).

The backend entrypoint applies committed Prisma migrations, optionally runs the seed when `RUN_SEED=true`, and then starts Node. The seed inserts demo data only into an empty database unless `FORCE_SEED=true` is set; forced runs remain insert-only. Persistent database and upload volumes survive backend restarts. To reset local Compose data and allow a fresh seed:

```sh
docker compose down -v
docker compose up --build
```

## Database migrations

`prisma/migrations/` contains the initial schema migration. Never edit a committed migration; create a new one with `npx prisma migrate dev --name <change>`. To check for schema drift, set `SHADOW_DATABASE_URL` to an empty PostgreSQL database and run `sh scripts/check-migrations.sh`.

## Seed accounts

All seeded accounts use `Admin@123`:

| Role | Email | Username |
|---|---|---|
| ADMIN | `admin@store.com` | `admin` |
| CUSTOMER | `customer@test.com` | `testcustomer` |
| CUSTOMER | `customer2@test.com` | `testcustomer2` |

The seed also creates eight categories and 25 realistic catalog products, with public Unsplash photo URLs. It never overwrites existing users, categories, or products, including inactive products. Change the sample credentials and `JWT_SECRET` before any non-local deployment.

Set `RUN_SEED=true` to invoke the seed at container startup. By default it skips any database that already contains users or products. Set `FORCE_SEED=true` to bypass that empty-database guard; the operation remains insert-only.

## API conventions

- Every API route is under `/api/v1`.
- Resource IDs are UUIDs. Orders also expose a separate sequential `orderNumber` for customer-facing display; use the UUID `id` in API routes.
- Successful responses use `{ "success": true, "data": ..., "timestamp": "..." }`.
- Lists use `data: { items, meta: { total, page, limit, totalPages, hasNext, hasPrev } }` (notifications also include `unreadCount`).
- Errors use `{ "statusCode", "code", "message", "error", "details?", "timestamp", "path" }`.
- Attach `Authorization: Bearer <accessToken>` to protected routes.
- Product image uploads accept jpeg/png/webp with matching extension, MIME type, and file signature, random server-generated filenames, and a configurable 2 MB default cap.

## Architecture

```text
src/
├── auth/             JWT registration, login, account lockout
├── users/            profile and ADMIN user management
├── products/         categories, catalog CRUD, file uploads
├── orders/           ownership, order transaction, status transition table
├── notifications/    per-user notifications created from order events
├── inventory/        InventoryPort token + in-memory adapter (replaceable seam)
├── common/           auth guards, validation, response/error handling, pagination
└── prisma/           Prisma connection

PostgreSQL 16 ← Prisma migrations/seed ← NestJS REST API → uploads volume
                                            └─ InventoryPort → in-memory demo adapter
```

Product records do not contain stock. Products and Orders use only `INVENTORY_PORT`; Requirement 2 can replace the provider with a persistent inventory service without changing those modules. The demo adapter keeps stock in process memory, so stock overrides and reservations reset when the backend process restarts. Seed products use external image URLs, while uploaded product images use relative `/uploads/...` paths.

## Routes and roles

| Method | Route | Role | Purpose |
|---|---|---|---|
| POST | `/auth/register`, `/auth/login` | Public, strict rate limit | Register/login |
| GET | `/auth/me` | Any authenticated | Current user |
| GET | `/users/profile` | Any authenticated | Own profile |
| CRUD | `/users` | ADMIN | User administration |
| GET | `/categories` | Any authenticated | Category list |
| POST/PATCH/DELETE | `/categories` | ADMIN | Category management |
| GET | `/products`, `/products/:id` | Any authenticated | Search/filter/list/details (stock comes from InventoryPort) |
| POST/PATCH/DELETE | `/products`, `/products/:id` | ADMIN | Multipart product CRUD; ordered products are soft-deleted |
| PATCH | `/products/:id/stock` | ADMIN | Set in-memory demo stock |
| POST | `/orders` | CUSTOMER | Create order from `{ items: [{ productId, quantity }] }` |
| GET | `/orders`, `/orders/:id` | Any authenticated | Customers see only their orders; admins can see all |
| PATCH | `/orders/:id/status` | ADMIN | Advance order status |
| POST | `/orders/:id/cancel` | Order owner | Cancel own PENDING/CONFIRMED order |
| GET | `/notifications` | Any authenticated | Own notifications, newest first |
| PATCH | `/notifications/:id/read`, `/notifications/read-all` | Any authenticated | Mark own notification(s) read |

Allowed order transitions: PENDING→CONFIRMED→SHIPPED→DELIVERED, with cancellation allowed from PENDING or CONFIRMED. Invalid or concurrent transitions return `409 INVALID_STATUS_TRANSITION`. The database conditionally applies each transition; cancellation releases stock after commit, so concurrent cancellation can release a reservation only once. Reservations use order IDs as idempotency references; a repeated reserve does not decrement stock twice, and a repeated or unknown release does not add stock.

## Tests and demo

```sh
npm test
npm run build
npm run test:e2e
```

`npm run test:e2e` starts `docker-compose.test.yml` (PostgreSQL on port 5433), applies migrations and seed, then runs the e2e suite. Docker Desktop must be running. Run `sh scripts/check-migrations.sh` with `SHADOW_DATABASE_URL` set to an empty PostgreSQL database to detect schema drift. Run `sh scripts/demo.sh` to walk through login, product listing, order creation, cross-user `403`, invalid-transition `409`, and login rate limit `429` (requires curl and Node; jq is optional).

## Known limitations

- Inventory is an in-memory stub. Stock resets to `STUB_DEFAULT_STOCK` when the backend restarts; Requirement 2 replaces it with a persistent service behind the same `InventoryPort`.
- Seed products use external image URLs, while uploaded images use relative `/uploads/...` paths.

## Non-functional requirement → implementation → proof

| Requirement | Implementation | Proof |
|---|---|---|
| JWT authentication | `src/auth`, Passport JWT guard | e2e: protected API without bearer token returns 401 |
| RBAC | `@Auth(Role.ADMIN/CUSTOMER)` + RolesGuard | e2e: customer cannot create product or change status (403) |
| Order ownership | Checks in `OrdersService` | e2e: customer B gets 403 on customer A's order; own list excludes it |
| Rate limiting | Global 100/min default; login/register env-configurable 5/min | e2e: login returns 429 at configured limit |
| Account lockout | `UsersService` + `AuthService` | Five invalid password attempts lock account for configured minutes |
| Helmet | `configureApp()` | Inspect response security headers |
| CORS | `configureApp()`, explicit origin allowlist | Configure `CORS_ORIGIN`; wildcard is not used with credentials |
| Validation | Global `ValidationPipe`, DTO validators, max page size 100 | e2e: unknown fields and limit=1000 return 400 |
| Password hashing | bcryptjs in UsersService/AuthService | Seed/register use bcrypt; API response tests assert sensitive fields absent |
| Unified errors | `AllExceptionsFilter`, stable code field, Prisma P2002/P2025 mapping | e2e asserts `FORBIDDEN`, `INSUFFICIENT_STOCK`, `INVALID_STATUS_TRANSITION`, `TOO_MANY_REQUESTS` |
| Concurrency-safe status changes | Conditional order status update in the database; cancellation releases after commit | e2e races two cancellation requests and verifies stock is restored once |
| Compensation on partial failures | Failed order creation releases its idempotent inventory reservation; failed product stock initialization deletes the product row | unit tests cover order compensation and product row cleanup |
| Non-destructive seed | Empty-database guard; forced seed is insert-only | e2e edits, deactivates, and renames seeded data before rerunning the seed |
| Docker hardening | Node user, private DB, no production pgAdmin, named volumes | inspect Dockerfile/Compose; clean compose boot and restart persistence |

## Project scripts

- `npm run build`: TypeScript production build.
- `npm test`: unit tests.
- `npm run test:e2e`: test database + security/API e2e proofs.
- `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:seed`: local Prisma workflow.
