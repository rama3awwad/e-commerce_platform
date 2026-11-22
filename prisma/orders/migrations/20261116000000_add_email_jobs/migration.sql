-- CreateEnum
CREATE TYPE "EmailJobStatus" AS ENUM ('QUEUED', 'RETRYING', 'SENT', 'DEAD');

-- CreateTable
CREATE TABLE "email_jobs" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "EmailJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_jobs_orderId_key" ON "email_jobs"("orderId");

-- CreateIndex
CREATE INDEX "email_jobs_status_createdAt_idx" ON "email_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_jobs_publishedAt_createdAt_idx" ON "email_jobs"("publishedAt", "createdAt");