-- CreateEnum
CREATE TYPE "strategic_initiative_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "strategic_initiatives" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "strategicObjective" TEXT,
    "owner" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "status" "strategic_initiative_status" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "strategic_initiatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategic_initiative_progress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "percentComplete" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategic_initiative_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategic_milestones" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "control_status" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategic_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RiskToStrategicInitiative" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RiskToStrategicInitiative_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "strategic_initiatives_organisationId_idx" ON "strategic_initiatives"("organisationId");

-- CreateIndex
CREATE INDEX "strategic_initiatives_tenantId_idx" ON "strategic_initiatives"("tenantId");

-- CreateIndex
CREATE INDEX "strategic_initiatives_status_idx" ON "strategic_initiatives"("status");

-- CreateIndex
CREATE INDEX "strategic_initiatives_priority_idx" ON "strategic_initiatives"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "strategic_initiatives_organisationId_code_key" ON "strategic_initiatives"("organisationId", "code");

-- CreateIndex
CREATE INDEX "strategic_initiative_progress_initiativeId_idx" ON "strategic_initiative_progress"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "strategic_initiative_progress_initiativeId_month_key" ON "strategic_initiative_progress"("initiativeId", "month");

-- CreateIndex
CREATE INDEX "strategic_milestones_initiativeId_idx" ON "strategic_milestones"("initiativeId");

-- CreateIndex
CREATE INDEX "_RiskToStrategicInitiative_B_index" ON "_RiskToStrategicInitiative"("B");

-- AddForeignKey
ALTER TABLE "strategic_initiatives" ADD CONSTRAINT "strategic_initiatives_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_initiative_progress" ADD CONSTRAINT "strategic_initiative_progress_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "strategic_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_milestones" ADD CONSTRAINT "strategic_milestones_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "strategic_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskToStrategicInitiative" ADD CONSTRAINT "_RiskToStrategicInitiative_A_fkey" FOREIGN KEY ("A") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RiskToStrategicInitiative" ADD CONSTRAINT "_RiskToStrategicInitiative_B_fkey" FOREIGN KEY ("B") REFERENCES "strategic_initiatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
