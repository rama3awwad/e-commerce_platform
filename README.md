# Restaurant Ordering Platform - Backend API

A comprehensive NestJS backend API for a restaurant ordering platform, built with TypeScript, Prisma ORM, PostgreSQL, and Docker.

## 🏗️ Architecture

```
src/
├── main.ts              # Entry point (helmet, CORS, Swagger, global pipes)
├── app.module.ts        # Root module
├── auth/                # Authentication module (JWT, register, login)
│   ├── strategies/      # Passport JWT strategy
│   ├── dto/             # Auth DTOs
│   └── guards/          # Auth guards
├── users/               # Users module (CRUD, roles)
│   └── dto/             # User DTOs
├── prisma/              # Prisma service & module
└── common/              # Shared utilities
    ├── guards/          # JwtAuthGuard, RolesGuard
    ├── decorators/      # @Roles(), @Auth(), @CurrentUser()
    ├── filters/         # AllExceptionsFilter
    ├── interceptors/    # TransformInterceptor
    └── dto/             # PaginationDto
```

## 🚀 Quick Start

### With Docker (Recommended)

```bash
docker compose up -d
```

The API will be available at `http://localhost:3000`

### Without Docker

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev

# Seed database (optional)
npm run prisma:seed

# Start development server
npm run start:dev
```

## 📖 API Documentation

Swagger UI is available at: `http://localhost:3000/api/docs`

## 🔐 Default Users (after seeding)

| Role         | Email                        | Password   |
|-------------|------------------------------|------------|
| Admin       | admin@restaurant.com         | Admin@123  |
| Customer    | customer@test.com            | Admin@123  |

## 🛡️ Security Features

- **JWT Authentication** - Bearer token authentication
- **Role-Based Access Control** - CUSTOMER, ADMIN roles
- **Account Lockout** - Account locked after 5 failed login attempts (configurable)
- **Rate Limiting** - Throttler guard for API rate limiting
- **Helmet** - Security HTTP headers
- **CORS** - Cross-origin resource sharing configuration
- **Input Validation** - class-validator with whitelist

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📦 Tech Stack

- **Framework**: NestJS 10
- **Language**: TypeScript
- **ORM**: Prisma 6
- **Database**: PostgreSQL 16
- **Auth**: Passport + JWT
- **Validation**: class-validator + class-transformer
- **Docs**: Swagger/OpenAPI
- **Security**: Helmet + CORS + Throttler
- **Containerization**: Docker + Docker Compose
