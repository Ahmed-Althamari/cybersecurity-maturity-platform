-- CreateTable
CREATE TABLE "control_mappings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceSubcategoryId" TEXT NOT NULL,
    "targetSubcategoryId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_mappings_tenantId_idx" ON "control_mappings"("tenantId");

-- CreateIndex
CREATE INDEX "control_mappings_sourceSubcategoryId_idx" ON "control_mappings"("sourceSubcategoryId");

-- CreateIndex
CREATE INDEX "control_mappings_targetSubcategoryId_idx" ON "control_mappings"("targetSubcategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "control_mappings_tenantId_sourceSubcategoryId_targetSubcate_key" ON "control_mappings"("tenantId", "sourceSubcategoryId", "targetSubcategoryId");

-- AddForeignKey
ALTER TABLE "control_mappings" ADD CONSTRAINT "control_mappings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_mappings" ADD CONSTRAINT "control_mappings_sourceSubcategoryId_fkey" FOREIGN KEY ("sourceSubcategoryId") REFERENCES "subcategories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_mappings" ADD CONSTRAINT "control_mappings_targetSubcategoryId_fkey" FOREIGN KEY ("targetSubcategoryId") REFERENCES "subcategories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
