-- AlterTable
ALTER TABLE "sms_messages" ADD COLUMN     "dedup_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sms_messages_dedup_key_key" ON "sms_messages"("dedup_key");

