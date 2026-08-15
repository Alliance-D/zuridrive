-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "bodyKey" TEXT,
ADD COLUMN     "params" JSONB,
ADD COLUMN     "titleKey" TEXT;
