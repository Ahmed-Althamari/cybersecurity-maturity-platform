// prisma/seed.ts
// Seed script for CMMP database

import { PrismaClient, MaturityLevel, RiskLevel, ControlStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { NIST_CSF_2_0, persistFrameworkDefinition } from "@cmmp/framework-engine";
import type { FrameworkWriteClient, RawFrameworkRecord } from "@cmmp/framework-engine";

const prisma = new PrismaClient();

// Local-development-only demo password. Never used in production: production
// deployments must create users with their own credentials via the API.
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPassword123!";

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
  // Loads the complete NIST CSF 2.0 core (6 Functions, 22 Categories, 106
  // Subcategory outcomes) through the same framework-agnostic engine
  // (@cmmp/framework-engine, ADR-006) and persistence path
  // (persistFrameworkDefinition) the API's POST /frameworks uses — the seed
  // script exercises the real import pipeline rather than hand-rolling a
  // parallel one. See NIST_CSF_2_0's own doc comment for data provenance.
  console.log("Creating NIST CSF 2.0 framework (6 functions, 22 categories, 106 subcategories)...");
  // Adapts the generated Prisma client to @cmmp/framework-engine's minimal
  // structural FrameworkWriteClient interface (same approach as
  // apps/api/src/framework/framework.service.ts) rather than relying on
  // Prisma's generic delegate type happening to satisfy it.
  const frameworkWriteClient: FrameworkWriteClient = {
    framework: {
      create: (args) => prisma.framework.create(args as never) as unknown as Promise<RawFrameworkRecord>,
    },
  };
  const nistFrameworkTree = await persistFrameworkDefinition(
    frameworkWriteClient,
    tenant.id,
    NIST_CSF_2_0,
  );

  const governFunction = nistFrameworkTree.functions.find((fn) => fn.code === "GV");
  const rmCategory = governFunction?.categories.find((cat) => cat.code === "GV.RM");
  // The demo assessment below narrates a risk-management story, so it draws
  // its 3 sample assessment items from GV.RM's first 3 subcategories
  // (risk objectives, risk appetite, enterprise risk integration).
  const createdQuestions = (rmCategory?.subcategories ?? [])
    .slice(0, 3)
    .map((subcategory) => subcategory.questions[0]);

  // ============================================================================
  // ASSESSMENT
  // ============================================================================
  console.log("Creating sample assessment...");
  const assessment = await prisma.assessment.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      name: "Q3 2026 Cybersecurity Assessment",
      description: "Initial comprehensive cybersecurity maturity assessment",
      status: "SUBMITTED",
      assessmentDate: new Date("2026-08-30"),
      currentMaturity: 2.7,
      targetMaturity: 3.8,
      maturityGap: 1.1,
      completionPercentage: 95,
      createdById: assessorUser.id,
      updatedById: assessorUser.id,
    },
  });

  // Create assessment responses
  console.log("Creating assessment responses...");
  const assessmentItems = await Promise.all(
    createdQuestions.map((q, idx) =>
      prisma.assessmentItem.create({
        data: {
          assessmentId: assessment.id,
          questionId: q.id,
          currentMaturity: ["DEVELOPING", "DEFINED", "INITIAL"][idx] as MaturityLevel,
          targetMaturity: "DEFINED",
          weight: 1.0,
          riskLevel: ["MEDIUM", "LOW", "HIGH"][idx] as RiskLevel,
          businessCriticality: [4, 5, 3][idx],
          controlStatus: "IN_PROGRESS" as ControlStatus,
          rationale: `Assessment of ${q.question}`,
          ownerName: "IT Security Team",
          ownerEmail: "security@example.com",
        },
      })
    )
  );

  // ============================================================================
  // RISKS
  // ============================================================================
  console.log("Creating sample risks...");
  const riskData = [
    {
      title: "Inadequate Risk Management Process",
      description: "Risk management processes are not fully formalized",
      threat: "Unmanaged cybersecurity risks",
      riskLevel: RiskLevel.HIGH,
      assessmentItemId: assessmentItems[0].id,
    },
    {
      title: "Lack of Formal Risk Identification",
      description: "Risk identification is ad-hoc rather than systematic",
      threat: "Risks are missed during assessment",
      riskLevel: RiskLevel.MEDIUM,
      assessmentItemId: assessmentItems[1].id,
    },
    {
      title: "Limited Risk Analysis Capability",
      description: "Risk analysis lacks maturity and formalization",
      threat: "Poor risk prioritization",
      riskLevel: RiskLevel.MEDIUM,
      assessmentItemId: assessmentItems[2].id,
    },
  ];

  const createdRisks = await Promise.all(
    riskData.map((risk) =>
      prisma.risk.create({
        data: {
          tenantId: tenant.id,
          organisationId: organisation.id,
          title: risk.title,
          description: risk.description,
          threat: risk.threat,
          likelihood: 4,
          impact: 4,
          inherentRiskScore: 16,
          residualRiskScore: 12,
          riskLevel: risk.riskLevel,
          owner: "Chief Risk Officer",
          status: "OPEN",
          assessmentItemId: risk.assessmentItemId,
        },
      })
    )
  );

  // ============================================================================
  // REMEDIATION INITIATIVES
  // ============================================================================
  console.log("Creating remediation initiatives...");
  const initiatives = [
    {
      title: "Formalize Risk Management Process",
      description: "Establish and document comprehensive risk management process",
      priority: 1,
      complexity: 3,
      targetMaturity: MaturityLevel.DEFINED,
      estimatedCost: 50000,
      targetCompletionDate: new Date("2026-11-30"),
      riskIds: [createdRisks[0].id],
    },
    {
      title: "Implement Systematic Risk Identification",
      description: "Develop and implement systematic risk identification methodology",
      priority: 2,
      complexity: 3,
      targetMaturity: MaturityLevel.DEFINED,
      estimatedCost: 30000,
      targetCompletionDate: new Date("2026-12-31"),
      riskIds: [createdRisks[1].id],
    },
    {
      title: "Enhance Risk Analysis Capabilities",
      description: "Build capability for consistent risk analysis and prioritization",
      priority: 3,
      complexity: 2,
      targetMaturity: MaturityLevel.MANAGED,
      estimatedCost: 25000,
      targetCompletionDate: new Date("2027-01-31"),
      riskIds: [createdRisks[2].id],
    },
  ];

  await Promise.all(
    initiatives.map((init) =>
      prisma.remediationInitiative.create({
        data: {
          tenantId: tenant.id,
          organisationId: organisation.id,
          title: init.title,
          description: init.description,
          priority: init.priority,
          complexity: init.complexity,
          currentMaturity: MaturityLevel.INITIAL,
          targetMaturity: init.targetMaturity,
          estimatedCost: init.estimatedCost,
          targetCompletionDate: init.targetCompletionDate,
          status: "PLANNED",
          owner: "Head of Security",
          risks: {
            connect: init.riskIds.map((id) => ({ id })),
          },
        },
      })
    )
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
