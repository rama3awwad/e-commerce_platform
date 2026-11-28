-- Add worker identity for email processing evidence.
ALTER TABLE "email_jobs" ADD COLUMN "processedBy" TEXT;
