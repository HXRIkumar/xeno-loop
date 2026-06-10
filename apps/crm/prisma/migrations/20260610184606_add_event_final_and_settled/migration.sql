-- AlterTable
ALTER TABLE "Communication" ADD COLUMN     "settledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CommunicationEvent" ADD COLUMN     "final" BOOLEAN NOT NULL DEFAULT false;
