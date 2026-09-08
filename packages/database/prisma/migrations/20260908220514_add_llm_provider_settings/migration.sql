-- AlterTable
ALTER TABLE "_RemediationInitiativeToRisk" ADD CONSTRAINT "_RemediationInitiativeToRisk_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_RemediationInitiativeToRisk_AB_unique";

-- CreateTable
CREATE TABLE "llm_provider_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "format" TEXT NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiKeyPreview" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_provider_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_provider_settings_tenantId_idx" ON "llm_provider_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "llm_provider_settings_tenantId_slot_key" ON "llm_provider_settings"("tenantId", "slot");

-- AddForeignKey
ALTER TABLE "llm_provider_settings" ADD CONSTRAINT "llm_provider_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
