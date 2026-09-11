-- CreateTable
CREATE TABLE "llm_usage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_limits" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dailyCallLimit" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_usage_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_usage_events_tenantId_createdAt_idx" ON "llm_usage_events"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_limits_tenantId_key" ON "llm_usage_limits"("tenantId");

-- AddForeignKey
ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_limits" ADD CONSTRAINT "llm_usage_limits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
