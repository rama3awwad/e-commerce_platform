-- CreateTable
CREATE TABLE "app_flags" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_flags_pkey" PRIMARY KEY ("key")
);