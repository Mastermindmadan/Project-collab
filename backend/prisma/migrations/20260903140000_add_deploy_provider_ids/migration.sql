-- AlterTable: per-project Deployment Intelligence provider ids.
-- These columns are nullable; a NULL value means that provider is not
-- configured for the project (surfaced as "Deployment not configured").
ALTER TABLE "Project" ADD COLUMN "vercelProjectId" TEXT,
ADD COLUMN "renderServiceId" TEXT;