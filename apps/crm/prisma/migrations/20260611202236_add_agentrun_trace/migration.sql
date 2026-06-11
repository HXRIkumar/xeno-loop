-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "traceJson" JSONB;

-- CreateIndex
CREATE INDEX "AgentRun_campaignId_idx" ON "AgentRun"("campaignId");
