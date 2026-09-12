-- CreateTable
CREATE TABLE "assistant_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_digests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "alertCount" INTEGER NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_digests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assistant_notes_tenantId_organisationId_idx" ON "assistant_notes"("tenantId", "organisationId");

-- CreateIndex
CREATE INDEX "assistant_digests_tenantId_organisationId_idx" ON "assistant_digests"("tenantId", "organisationId");

-- AddForeignKey
ALTER TABLE "assistant_notes" ADD CONSTRAINT "assistant_notes_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_digests" ADD CONSTRAINT "assistant_digests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
