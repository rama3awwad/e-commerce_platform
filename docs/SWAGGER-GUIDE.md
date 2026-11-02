# Swagger / OpenAPI Guide

## Open the API documentation

Start the full stack from the repository root:

```powershell
Copy-Item .env.example .env # only if .env does not already exist
# Set DATABASE_URL and JWT_SECRET in .env; use the Compose service name `db` as the DB host.
docker compose up --build
```

Open [Swagger UI](http://localhost:3000/api/docs). The API base path is `/api/v1`; uploaded images are served at `/uploads/<generated-filename>`. Health check: [http://localhost:3000/api/v1/health](http://localhost:3000/api/v1/health).

If running the Nest app directly on Windows instead of in Compose, the database URL must use `localhost`/`127.0.0.1` and Postgres must be running locally or exposed by the development Compose override. Inside Compose, use host `db`. In either case the URL must begin with `postgresql://` or `postgres://`.

## Authentication in Swagger

1. Call `POST /api/v1/auth/login` with an `identifier` (email or username) and `password`.
2. Copy `data.accessToken` from the success envelope.
3. Click **Authorize** and paste the token. Swagger configures the `Bearer` prefix; do not type `Bearer ` yourself.
4. Call protected routes. Register creates a CUSTOMER account only. ADMIN accounts are created through `POST /api/v1/users` by an admin.

Seeded demo accounts (password `Admin@123`):

| Role | Email | Username |
|---|---|---|
| ADMIN | `admin@store.com` | `admin` |
| CUSTOMER | `customer@test.com` | `testcustomer` |
| CUSTOMER | `customer2@test.com` | `testcustomer2` |

Change demo credentials and `JWT_SECRET` before deploying outside a local project demo.

## Response formats

Every successful API response is wrapped as:

```json
{ "success": true, "data": {}, "timestamp": "2026-01-01T12:00:00.000Z" }
```

Paginated endpoints put records and paging information under `data`:

```json
{
  "success": true,
  "data": {
    "items": [],
    "meta": { "total": 0, "page": 1, "limit": 10, "totalPages": 0, "hasNext": false, "hasPrev": false }
  },
  "timestamp": "2026-01-01T12:00:00.000Z"
}
```

Notifications include `unreadCount` with their pagination metadata. Errors use one shape:

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "message": "You cannot access this order",
  "error": "Forbidden",
  "details": null,
  "timestamp": "2026-01-01T12:00:00.000Z",
  "path": "/api/v1/orders/<id>"
}
```

`details` is optional. Unexpected internal and Prisma errors are logged server-side; internal exception messages are not returned to clients. A user response never includes password hashes or account lockout internals.

## Endpoint reference

All paths below are relative to `/api/v1`. `Public` means no token is required. Other routes require a JWT.

Resource `id` values are UUIDs. Orders additionally expose a sequential `orderNumber` for customer-facing display. Use the UUID `id` in API routes and related request fields; display `orderNumber` in the customer interface.

### Health

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/health` | Public | Liveness/health response |

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/register` | Public | Register a CUSTOMER; returns token and safe user data |
| POST | `/auth/login` | Public | Login with email or username and password |
| GET | `/auth/me` | CUSTOMER or ADMIN | Return the current authenticated user's safe profile |

Register/login have a strict configurable rate limit (`LOGIN_THROTTLE_LIMIT`, `LOGIN_THROTTLE_TTL`; defaults 5 requests per 60 seconds). A broader configurable global limit applies to other routes (`THROTTLE_LIMIT`, `THROTTLE_TTL`; defaults 100 per 60 seconds). Repeated invalid credentials trigger account lockout according to `ACCOUNT_LOCKOUT_ATTEMPTS` and `ACCOUNT_LOCKOUT_DURATION_MINUTES`.

### Users

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/users` | ADMIN | Create a user; role defaults to CUSTOMER and may be set by ADMIN |
| GET | `/users` | ADMIN | Search and paginate users (`page`, `limit`, `search`) |
| GET | `/users/profile` | CUSTOMER or ADMIN | Read only the caller's profile |
| GET | `/users/:id` | ADMIN | Read a user by UUID |
| PUT | `/users/:id` | ADMIN | Update permitted user fields |
| DELETE | `/users/:id` | ADMIN | Permanently delete a user; admins cannot delete themselves |

User list search matches email, username, first name, and last name. Pagination defaults to page 1 / limit 10; maximum limit is 100.

### Categories

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/categories` | CUSTOMER or ADMIN | List categories |
| POST | `/categories` | ADMIN | Create category (`name`, `slug`) |
| PATCH | `/categories/:id` | ADMIN | Update category |
| DELETE | `/categories/:id` | ADMIN | Delete category; conflict if it still contains products |

### Products and inventory stub

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/products` | CUSTOMER or ADMIN | Search/filter and paginate active products |
| GET | `/products/:id` | CUSTOMER or ADMIN | Product details including current stub stock |
| POST | `/products` | ADMIN | Create product with an image (`multipart/form-data`) |
| PATCH | `/products/:id` | ADMIN | Update product fields and optionally replace image |
| DELETE | `/products/:id` | ADMIN | Deactivate if used by orders; otherwise delete it and its image |
| PATCH | `/products/:id/stock` | ADMIN | Set demo inventory quantity (`quantity`, integer >= 0) |

`GET /products` supports `category`, `search`, `page`, and `limit`. Search matches product name without case sensitivity. Image uploads accept JPEG, PNG, or WebP only when MIME type and filename extension agree; maximum size defaults to 2 MiB (`UPLOAD_MAX_SIZE`). Filenames are generated by the server. Product stores a relative `/uploads/...` URL; files live in the `uploads` volume.

Stock is deliberately not stored in the Product table. `GET /products/:id` reads it through the `InventoryPort` abstraction. The current provider is an in-memory stub with default stock `STUB_DEFAULT_STOCK` (50). Its stock values reset when the backend process restarts. The gRPC inventory service is Requirement 2 and is not part of this API implementation.

Seeded sample products have public Unsplash image URLs, so their `imageUrl` values open directly in a browser and require internet access. Images uploaded by an admin are stored locally and use `http://localhost:3000/uploads/<generated-filename>`; the Docker `uploads` volume persists those files.

### Orders

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/orders` | CUSTOMER | Create order from `{ "items": [{ "productId": "<uuid>", "quantity": 1 }] }` |
| GET | `/orders` | CUSTOMER or ADMIN | CUSTOMER sees own orders; ADMIN sees all and can filter by status/user |
| GET | `/orders/:id` | Owner or ADMIN | Read one order; another customer's order returns 403 |
| PATCH | `/orders/:id/status` | ADMIN | Move order to an allowed next status |
| POST | `/orders/:id/cancel` | Owner | Cancel own PENDING or CONFIRMED order |

Order items must be non-empty; quantities must be integers from 1 to 100, and duplicate product IDs are rejected. Products must exist and be active. Current product prices are snapshotted as order item prices. Inventory is reserved before the database transaction; a database failure triggers a compensating stock release. Successful creation and status changes generate notifications.

Order responses include both `id` (UUID, used for API operations) and `orderNumber` (sequential integer, suitable for display to the customer).

Allowed status transitions:

| Current | Allowed next status |
|---|---|
| PENDING | CONFIRMED, CANCELLED |
| CONFIRMED | SHIPPED, CANCELLED |
| SHIPPED | DELIVERED |
| DELIVERED | None |
| CANCELLED | None |

Any other status change returns `409 INVALID_STATUS_TRANSITION`. Cancellation releases reserved stock.

### Notifications

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/notifications` | CUSTOMER or ADMIN | List only caller's notifications, newest first, with unread count |
| PATCH | `/notifications/:id/read` | Owner | Mark own notification read; other user's notification returns 403 |
| PATCH | `/notifications/read-all` | CUSTOMER or ADMIN | Mark all caller's notifications read |

Notifications are created for order creation and order status changes.

## Common status codes and error codes

| HTTP status | Error code(s) | Typical cause |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `IMAGE_TOO_LARGE`, `IMAGE_REQUIRED` | Invalid DTO/ID, unknown field, invalid image or request |
| 401 | `UNAUTHORIZED` | Missing, invalid, or expired token; invalid login credentials |
| 403 | `FORBIDDEN` | Role restriction, ownership restriction, locked/deactivated account |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `CONFLICT`, `INSUFFICIENT_STOCK`, `INVALID_STATUS_TRANSITION` | Unique conflict, insufficient stock, invalid state transition |
| 429 | `TOO_MANY_REQUESTS` | Request throttling |
| 503 | `INVENTORY_UNAVAILABLE` | Inventory provider unavailable |
| 500 | `INTERNAL_ERROR` | Unexpected server failure |

Validation is global: unknown properties are rejected, DTO constraints are enforced, and pagination limit cannot exceed 100. The application also uses JWT role guards, service-level order ownership checks, bcrypt password hashing, account lockout, Helmet security headers, configured CORS origins, and a non-root Docker runtime.

## Security and requirement proof map

| Requirement | Implementation location | How to demonstrate |
|---|---|---|
| JWT authentication and role checks | `src/auth`, `src/common/guards`, `@Auth()` | Call a protected route without a token (401); try an ADMIN route as CUSTOMER (403) |
| Order ownership | `src/orders/orders.service.ts` | Read another customer's order (403); check their order list does not include it |
| Login/register throttling | `src/auth/auth.controller.ts`, environment settings | Exceed configured login limit and observe 429 |
| Account lockout | authentication service + configuration | Exceed failed login attempt threshold and see temporary rejection |
| Input validation | DTOs and global ValidationPipe | Submit an unknown field or `limit=1000` and observe 400 |
| Password safety | bcrypt hashing and response DTOs | Register/login and inspect returned user; no password or lockout internals are exposed |
| Unified errors | `AllExceptionsFilter` | Trigger 400/401/403/404/409/429 and check stable `code` field |
| Order reliability | `OrdersService`, Prisma transaction, `InventoryPort` | Reserve stock and create order; transaction failure path releases reservation |
| Docker runtime | Dockerfile, Compose, entrypoint | Start with `docker compose up --build`; migration and optional seed run at startup |
| Persistent app data/files | Compose named `postgres_data` and `uploads` volumes | Restart backend; DB rows and uploaded images remain |
| Security headers/CORS | `src/configure-app.ts` | Inspect response headers and use an allowed CORS origin |

## Scope note

This guide describes the implemented Requirement 1 REST API and its in-memory inventory seam. Requirement 2 (separate gRPC inventory microservice), frontend integration, and any payment/cart functionality are outside this API phase.
