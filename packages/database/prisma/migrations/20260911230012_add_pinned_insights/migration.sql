-- CreateTable
CREATE TABLE "pinned_insights" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageBase64" TEXT NOT NULL,
    "chartData" TEXT,
    "sourceFileName" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_insights_tenantId_organisationId_idx" ON "pinned_insights"("tenantId", "organisationId");

-- AddForeignKey
ALTER TABLE "pinned_insights" ADD CONSTRAINT "pinned_insights_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
