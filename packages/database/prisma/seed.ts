// prisma/seed.ts
// Seed script for CMMP database

import { buildFrameworkCreateInput, frameworkTreeInclude } from "@cmmp/database";
import { parseFrameworkDefinition } from "@cmmp/framework-engine";
import { PrismaClient, MaturityLevel, RiskLevel, ControlStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

import nistCsf2Definition from "./fixtures/nist-csf-2.0.json";

const prisma = new PrismaClient();

// Local-development-only demo password. Never used in production: production
// deployments must create users with their own credentials via the API.
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPassword123!";

// ============================================================================
// SAMPLE ASSESSMENT DATA GENERATION
// ============================================================================
// Deterministic pseudo-random generator (mulberry32) so re-running the seed
// produces the same "realistic" (non-uniform) spread of scores every time,
// per the master prompt's guidance to avoid perfect/uniform sample data.
function mulberry32(seed: number) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// Per master prompt §36: non-uniform current maturity per function, target
// maturity in the 3.5-4.5 range.
const FUNCTION_MATURITY_PROFILE: Record<string, { current: number; target: number }> = {
  GV: { current: 2.2, target: 4.0 },
  ID: { current: 3.1, target: 4.0 },
  PR: { current: 2.8, target: 4.2 },
  DE: { current: 2.4, target: 3.8 },
  RS: { current: 2.1, target: 3.6 },
  RC: { current: 1.9, target: 3.5 },
};

const MATURITY_LEVEL_BY_SCORE = [
  MaturityLevel.NOT_APPLICABLE,
  MaturityLevel.INITIAL,
  MaturityLevel.DEVELOPING,
  MaturityLevel.DEFINED,
  MaturityLevel.MANAGED,
  MaturityLevel.OPTIMISED,
];
function levelFromScore(score: number): MaturityLevel {
  return MATURITY_LEVEL_BY_SCORE[clamp(Math.round(score), 1, 5)];
}

function riskLevelFromGap(gap: number): RiskLevel {
  if (gap >= 2.2) return RiskLevel.CRITICAL;
  if (gap >= 1.6) return RiskLevel.HIGH;
  if (gap >= 0.9) return RiskLevel.MEDIUM;
  if (gap >= 0.3) return RiskLevel.LOW;
  return RiskLevel.MINIMAL;
}

function controlStatusFromScore(score: number): ControlStatus {
  if (score < 1.8) return rand() < 0.15 ? ControlStatus.BLOCKED : rand() < 0.6 ? ControlStatus.NOT_STARTED : ControlStatus.IN_PROGRESS;
  if (score < 3.2) return rand() < 0.5 ? ControlStatus.IN_PROGRESS : ControlStatus.NOT_STARTED;
  if (score < 4.2) return rand() < 0.75 ? ControlStatus.COMPLETED : ControlStatus.IN_PROGRESS;
  return ControlStatus.COMPLETED;
}

interface AssessmentItemPlan {
  questionId: string;
  functionCode: string;
  subcategoryCode: string;
  subcategoryName: string;
  currentScore: number;
  targetScore: number;
  riskLevel: RiskLevel;
  businessCriticality: number;
  controlStatus: ControlStatus;
  weight: number;
}

async function main() {
  console.log("🌱 Starting database seed...");
  const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ============================================================================
  // CLEANUP (for development)
  // ============================================================================
  console.log("Cleaning up existing data...");
  await prisma.auditEvent.deleteMany();
  await prisma.importRecord.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.dashboardConfiguration.deleteMany();
  await prisma.capabilityTechnology.deleteMany();
  await prisma.technology.deleteMany();
  await prisma.securityCapability.deleteMany();
  await prisma.benchmark.deleteMany();
  await prisma.assessmentHistory.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.assessmentItem.deleteMany();
  await prisma.assessment.deleteMany();
  await prisma.assessmentTemplate.deleteMany();
  await prisma.recommendation.deleteMany();
  await prisma.remediationInitiative.deleteMany();
  await prisma.risk.deleteMany();
  await prisma.assessmentQuestion.deleteMany();
  await prisma.subcategory.deleteMany();
  await prisma.category.deleteMany();
  await prisma.function.deleteMany();
  await prisma.framework.deleteMany();
  await prisma.userRoleAssignment.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organisation.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.maturityModelLevel.deleteMany();
  await prisma.maturityModel.deleteMany();

  // ============================================================================
  // MATURITY MODEL
  // ============================================================================
  console.log("Creating maturity model...");
  const maturityModel = await prisma.maturityModel.create({
    data: {
      name: "CMMP Standard 0-5",
      description: "Standard 5-level maturity model",
      scale: 5,
      isDefault: true,
      levels: {
        create: [
          {
            level: 0,
            name: "Not Applicable",
            description: "Control is not applicable to the organization",
            color: "#999999",
          },
          {
            level: 1,
            name: "Initial",
            description:
              "Processes are informal, reactive or inconsistently performed",
            color: "#EF4444",
          },
          {
            level: 2,
            name: "Developing",
            description:
              "Processes and controls have started to become documented but implementation remains inconsistent",
            color: "#F97316",
          },
          {
            level: 3,
            name: "Defined",
            description:
              "Policies, standards and repeatable security processes are documented and implemented across the organization",
            color: "#FBBF24",
          },
          {
            level: 4,
            name: "Managed",
            description:
              "Security processes are measured, monitored and governed using metrics, automation and management oversight",
            color: "#60A5FA",
          },
          {
            level: 5,
            name: "Optimised",
            description:
              "Security processes are continually improved, highly automated and integrated with enterprise risk management",
            color: "#22C55E",
          },
        ],
      },
    },
  });

  // ============================================================================
  // TENANT & ORGANISATION
  // ============================================================================
  console.log("Creating tenant...");
  const tenant = await prisma.tenant.create({
    data: {
      name: "Development Tenant",
      slug: "dev-tenant",
      description: "Development and testing tenant",
    },
  });

  console.log("Creating organization...");
  const organisation = await prisma.organisation.create({
    data: {
      tenantId: tenant.id,
      name: "Sample Corporation",
      slug: "sample-corp",
      description: "Sample organization for demo and testing",
      country: "United States",
      industry: "Technology",
      size: "Large Enterprise",
    },
  });

  // ============================================================================
  // USERS
  // ============================================================================
  console.log("Creating demo users...");

  // Admin user
  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: "admin@example.local",
      name: "Administrator",
      passwordHash: demoPasswordHash,
      isActive: true,
      userRoleAssignments: {
        create: {
          role: "PLATFORM_ADMIN",
          tenantId: tenant.id,
        },
      },
    },
    include: { userRoleAssignments: true },
  });

  // CISO user
  const cisoUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: "ciso@example.local",
      name: "Chief Information Security Officer",
      passwordHash: demoPasswordHash,
      isActive: true,
      userRoleAssignments: {
        create: {
          role: "CISO",
          tenantId: tenant.id,
          organisationId: organisation.id,
        },
      },
    },
  });

  // Assessor user
  const assessorUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: "assessor@example.local",
      name: "Security Assessor",
      passwordHash: demoPasswordHash,
      isActive: true,
      userRoleAssignments: {
        create: {
          role: "ASSESSOR",
          tenantId: tenant.id,
          organisationId: organisation.id,
        },
      },
    },
  });

  // Viewer user
  const viewerUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: "viewer@example.local",
      name: "Read-Only Viewer",
      passwordHash: demoPasswordHash,
      isActive: true,
      userRoleAssignments: {
        create: {
          role: "READ_ONLY_VIEWER",
          tenantId: tenant.id,
          organisationId: organisation.id,
        },
      },
    },
  });

  // ============================================================================
  // FRAMEWORK - NIST CSF 2.0
  // ============================================================================
  // Loaded from prisma/fixtures/nist-csf-2.0.json and validated through
  // @cmmp/framework-engine (the Phase 4 loader) rather than hand-built via
  // ad hoc Prisma calls — this is the complete 6 function / 22 category /
  // 106 subcategory NIST CSF 2.0 hierarchy, one assessment question per
  // subcategory, persisted as a single nested transaction.
  console.log("Creating NIST CSF 2.0 framework...");
  const nistDefinition = parseFrameworkDefinition(nistCsf2Definition);
  const nistFramework = await prisma.framework.create({
    data: buildFrameworkCreateInput(tenant.id, nistDefinition),
    include: frameworkTreeInclude,
  });
  const categoryCount = nistFramework.functions.reduce((sum, fn) => sum + fn.categories.length, 0);
  const subcategoryCount = nistFramework.functions.reduce(
    (sum, fn) => sum + fn.categories.reduce((s, c) => s + c.subcategories.length, 0),
    0,
  );
  console.log(`  ${nistFramework.functions.length} functions, ${categoryCount} categories, ${subcategoryCount} subcategories`);

  // ============================================================================
  // ASSESSMENT
  // ============================================================================
  // One assessment item per NIST CSF 2.0 subcategory question, with a
  // realistic (non-uniform) spread of current/target maturity per function —
  // see FUNCTION_MATURITY_PROFILE above.
  console.log("Generating sample assessment responses...");
  const itemPlans: AssessmentItemPlan[] = [];
  for (const fn of nistFramework.functions) {
    const profile = FUNCTION_MATURITY_PROFILE[fn.code] ?? { current: 2.5, target: 4.0 };
    for (const category of fn.categories) {
      for (const subcategory of category.subcategories) {
        const question = subcategory.assessmentQuestions[0];
        if (!question) continue;

        const currentScore = clamp(profile.current + (rand() - 0.5) * 1.6, 1, 5);
        const targetScore = clamp(profile.target + (rand() - 0.5) * 0.6, currentScore + 0.2, 5);

        itemPlans.push({
          questionId: question.id,
          functionCode: fn.code,
          subcategoryCode: subcategory.code,
          subcategoryName: subcategory.name,
          currentScore,
          targetScore,
          riskLevel: riskLevelFromGap(targetScore - currentScore),
          businessCriticality: clamp(Math.round(3 + (rand() - 0.5) * 4), 1, 5),
          controlStatus: controlStatusFromScore(currentScore),
          weight: Number((0.8 + rand() * 0.4).toFixed(2)),
        });
      }
    }
  }

  const totalWeight = itemPlans.reduce((sum, item) => sum + item.weight, 0);
  const weightedCurrent = itemPlans.reduce((sum, item) => sum + item.currentScore * item.weight, 0) / totalWeight;
  const weightedTarget = itemPlans.reduce((sum, item) => sum + item.targetScore * item.weight, 0) / totalWeight;

  console.log("Creating sample assessment...");
  const assessment = await prisma.assessment.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      name: "Q3 2026 Cybersecurity Assessment",
      description: "Initial comprehensive cybersecurity maturity assessment against NIST CSF 2.0",
      status: "SUBMITTED",
      assessmentDate: new Date("2026-08-30"),
      currentMaturity: Number(weightedCurrent.toFixed(2)),
      targetMaturity: Number(weightedTarget.toFixed(2)),
      maturityGap: Number((weightedTarget - weightedCurrent).toFixed(2)),
      completionPercentage: Math.round(94 + rand() * 5),
      createdById: assessorUser.id,
      updatedById: assessorUser.id,
      items: {
        create: itemPlans.map((item) => ({
          questionId: item.questionId,
          currentMaturity: levelFromScore(item.currentScore),
          targetMaturity: levelFromScore(item.targetScore),
          weight: item.weight,
          riskLevel: item.riskLevel,
          businessCriticality: item.businessCriticality,
          controlStatus: item.controlStatus,
          rationale: `Maturity assessed against NIST CSF 2.0 ${item.subcategoryCode}: ${item.subcategoryName}`,
          ownerName: "IT Security Team",
          ownerEmail: "security@example.com",
        })),
      },
    },
    include: { items: true },
  });
  console.log(`  ${assessment.items.length} assessment items created`);

  const itemsByQuestionId = new Map(assessment.items.map((item) => [item.questionId, item]));
  const plansWithItems = itemPlans
    .map((plan) => ({ plan, item: itemsByQuestionId.get(plan.questionId) }))
    .filter((entry): entry is { plan: AssessmentItemPlan; item: (typeof assessment.items)[number] } => Boolean(entry.item));

  // ============================================================================
  // RISKS
  // ============================================================================
  // Not every maturity gap becomes a tracked Risk — only the highest-gap
  // subcategories do, the way a real risk register stays curated rather
  // than mirroring the full assessment 1:1.
  console.log("Creating sample risks...");
  const gapOf = (plan: AssessmentItemPlan) => plan.targetScore - plan.currentScore;
  const riskCandidates = [...plansWithItems].sort((a, b) => gapOf(b.plan) - gapOf(a.plan)).slice(0, 12);

  const createdRisks = await Promise.all(
    riskCandidates.map(({ plan, item }) => {
      const likelihood = clamp(Math.round(5 - plan.currentScore), 1, 5);
      const impact = plan.businessCriticality;
      return prisma.risk.create({
        data: {
          tenantId: tenant.id,
          organisationId: organisation.id,
          title: `Maturity gap: ${plan.subcategoryCode}`,
          description: plan.subcategoryName,
          threat: `Unmet NIST CSF 2.0 outcome in the ${plan.functionCode} function (${plan.subcategoryCode})`,
          likelihood,
          impact,
          inherentRiskScore: likelihood * impact,
          residualRiskScore: Math.max(1, likelihood * impact - 4),
          riskLevel: plan.riskLevel,
          owner: "Chief Risk Officer",
          status: "OPEN",
          assessmentItemId: item.id,
        },
      });
    }),
  );

  // ============================================================================
  // REMEDIATION INITIATIVES
  // ============================================================================
  console.log("Creating remediation initiatives...");
  await Promise.all(
    createdRisks.slice(0, 6).map((risk, idx) => {
      const { plan } = riskCandidates[idx];
      return prisma.remediationInitiative.create({
        data: {
          tenantId: tenant.id,
          organisationId: organisation.id,
          title: `Close gap: ${plan.subcategoryCode}`,
          description: `Address: ${plan.subcategoryName}`,
          priority: idx + 1,
          complexity: clamp(Math.round(1 + rand() * 2), 1, 3),
          currentMaturity: levelFromScore(plan.currentScore),
          targetMaturity: levelFromScore(plan.targetScore),
          estimatedCost: Math.round((15000 + rand() * 65000) / 5000) * 5000,
          targetCompletionDate: new Date(2026, 9 + idx, 30),
          status: "PLANNED",
          owner: "Head of Security",
          risks: {
            connect: [{ id: risk.id }],
          },
        },
      });
    }),
  );

  // ============================================================================
  // SECURITY CAPABILITIES
  // ============================================================================
  console.log("Creating security capabilities...");
  const capabilities = [
    {
      name: "Governance & Strategy",
      category: "Governance",
      currentMaturity: MaturityLevel.DEVELOPING,
      targetMaturity: MaturityLevel.MANAGED,
    },
    {
      name: "Risk Management",
      category: "Governance",
      currentMaturity: MaturityLevel.DEVELOPING,
      targetMaturity: MaturityLevel.DEFINED,
    },
    {
      name: "Identity & Access Management",
      category: "Protect",
      currentMaturity: MaturityLevel.DEFINED,
      targetMaturity: MaturityLevel.MANAGED,
    },
    {
      name: "Incident Response",
      category: "Respond",
      currentMaturity: MaturityLevel.INITIAL,
      targetMaturity: MaturityLevel.DEFINED,
    },
    {
      name: "Security Monitoring & Detection",
      category: "Detect",
      currentMaturity: MaturityLevel.DEFINED,
      targetMaturity: MaturityLevel.MANAGED,
    },
    {
      name: "Business Continuity & Disaster Recovery",
      category: "Recover",
      currentMaturity: MaturityLevel.DEVELOPING,
      targetMaturity: MaturityLevel.MANAGED,
    },
  ];

  const createdCapabilities = await Promise.all(
    capabilities.map((cap) =>
      prisma.securityCapability.create({
        data: {
          tenantId: tenant.id,
          organisationId: organisation.id,
          name: cap.name,
          category: cap.category,
          currentMaturity: cap.currentMaturity,
          targetMaturity: cap.targetMaturity,
          owner: "Head of Security",
        },
      })
    )
  );

  // ============================================================================
  // TECHNOLOGIES
  // ============================================================================
  console.log("Creating technology inventory...");
  const technologies = [
    { name: "Active Directory", vendor: "Microsoft", category: "Identity" },
    { name: "Microsoft Entra ID", vendor: "Microsoft", category: "Identity" },
    { name: "Microsoft Defender", vendor: "Microsoft", category: "Endpoint" },
    { name: "Microsoft Sentinel", vendor: "Microsoft", category: "SIEM" },
    { name: "Palo Alto Networks", vendor: "Palo Alto", category: "Network" },
    { name: "CrowdStrike", vendor: "CrowdStrike", category: "EDR" },
    { name: "Tenable Nessus", vendor: "Tenable", category: "Vulnerability" },
    {
      name: "ServiceNow ITSM",
      vendor: "ServiceNow",
      category: "IT Service Management",
    },
  ];

  const createdTechnologies = await Promise.all(
    technologies.map((tech) =>
      prisma.technology.create({
        data: {
          name: tech.name,
          vendor: tech.vendor,
          category: tech.category,
        },
      })
    )
  );

  // Link technologies to capabilities
  console.log("Mapping technologies to capabilities...");
  const iamCapability = createdCapabilities.find((c) => c.name.includes("Identity"));
  const detectionCapability = createdCapabilities.find((c) =>
    c.name.includes("Monitoring")
  );

  if (iamCapability) {
    await prisma.capabilityTechnology.create({
      data: {
        capabilityId: iamCapability.id,
        technologyId: createdTechnologies.find((t) => t.name === "Active Directory")!.id,
        utilization: 85,
        status: "ACTIVE",
      },
    });

    await prisma.capabilityTechnology.create({
      data: {
        capabilityId: iamCapability.id,
        technologyId: createdTechnologies.find((t) => t.name === "Microsoft Entra ID")!
          .id,
        utilization: 65,
        status: "ACTIVE",
      },
    });
  }

  if (detectionCapability) {
    await prisma.capabilityTechnology.create({
      data: {
        capabilityId: detectionCapability.id,
        technologyId: createdTechnologies.find((t) => t.name === "Microsoft Sentinel")!
          .id,
        utilization: 70,
        status: "ACTIVE",
      },
    });

    await prisma.capabilityTechnology.create({
      data: {
        capabilityId: detectionCapability.id,
        technologyId: createdTechnologies.find((t) => t.name === "Microsoft Defender")!
          .id,
        utilization: 80,
        status: "ACTIVE",
      },
    });
  }

  // ============================================================================
  // COMPLETION
  // ============================================================================
  console.log("✅ Database seed completed successfully!");
  console.log("");
  console.log("Demo Credentials (LOCAL DEVELOPMENT ONLY - never use in production):");
  console.log("=====================================================================");
  console.log(`Admin (Platform):  admin@example.local`);
  console.log(`CISO:              ciso@example.local`);
  console.log(`Assessor:          assessor@example.local`);
  console.log(`Viewer:            viewer@example.local`);
  console.log(`Password (all):    ${DEMO_PASSWORD} (override via DEMO_USER_PASSWORD)`);
  console.log("");
  console.log("Organization:");
  console.log("=============");
  console.log(`Name:              ${organisation.name}`);
  console.log(`Assessment:        ${assessment.name}`);
  console.log(`Status:            ${assessment.status}`);
  console.log(`Current Maturity:  ${assessment.currentMaturity}`);
  console.log(`Target Maturity:   ${assessment.targetMaturity}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed script error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
