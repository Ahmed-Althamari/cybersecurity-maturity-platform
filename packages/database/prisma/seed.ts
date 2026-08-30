// prisma/seed.ts
// Seed script for CMMP database

import { PrismaClient, MaturityLevel, RiskLevel, ControlStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seed...");

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
  await prisma.userRole.deleteMany();
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
      isActive: true,
      userRoles: {
        create: {
          role: "PLATFORM_ADMIN",
          tenantId: tenant.id,
        },
      },
    },
    include: { userRoles: true },
  });

  // CISO user
  const cisoUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      organisationId: organisation.id,
      email: "ciso@example.local",
      name: "Chief Information Security Officer",
      isActive: true,
      userRoles: {
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
      isActive: true,
      userRoles: {
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
      isActive: true,
      userRoles: {
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
  console.log("Creating NIST CSF 2.0 framework...");
  const nistFramework = await prisma.framework.create({
    data: {
      tenantId: tenant.id,
      name: "NIST Cybersecurity Framework 2.0",
      slug: "nist-csf-2.0",
      description: "NIST Cybersecurity Framework version 2.0",
      version: "2.0",
      frameWorkType: "NIST_CSF",
      isActive: true,
    },
  });

  // Create NIST Functions
  console.log("Creating NIST Functions...");
  const functions = [
    { code: "GV", name: "Govern", description: "Establish the vision and strategy" },
    { code: "ID", name: "Identify", description: "Develop understanding of cybersecurity risk" },
    { code: "PR", name: "Protect", description: "Develop and implement safeguards" },
    { code: "DE", name: "Detect", description: "Develop and implement detection procedures" },
    { code: "RS", name: "Respond", description: "Develop response procedures" },
    { code: "RC", name: "Recover", description: "Develop recovery procedures" },
  ];

  const createdFunctions = await Promise.all(
    functions.map((fn, idx) =>
      prisma.function.create({
        data: {
          frameworkId: nistFramework.id,
          code: fn.code,
          name: fn.name,
          description: fn.description,
          displayOrder: idx,
        },
      })
    )
  );

  // Create sample categories for Govern function
  console.log("Creating sample NIST categories...");
  const governFunction = createdFunctions.find((f) => f.code === "GV");
  const categories = [
    {
      code: "GV.RM",
      name: "Risk Management Strategy",
      description: "Risk management strategy development and execution",
    },
    {
      code: "GV.SC",
      name: "Supply Chain Risk Management",
      description: "Manage supply chain risk",
    },
    {
      code: "GV.RO",
      name: "Roles, Responsibilities, and Authorities",
      description: "Define roles, responsibilities, and authorities",
    },
  ];

  const createdCategories = await Promise.all(
    categories.map((cat, idx) =>
      prisma.category.create({
        data: {
          functionId: governFunction!.id,
          code: cat.code,
          name: cat.name,
          description: cat.description,
          displayOrder: idx,
        },
      })
    )
  );

  // Create sample subcategories
  console.log("Creating sample NIST subcategories...");
  const rmCategory = createdCategories.find((c) => c.code === "GV.RM");
  const subcategories = [
    {
      code: "GV.RM-01",
      name: "Risk Management Process Governance",
      description: "Establish and execute risk management processes",
    },
    {
      code: "GV.RM-02",
      name: "Risk Identification",
      description: "Identify cybersecurity risks",
    },
    {
      code: "GV.RM-03",
      name: "Risk Analysis",
      description: "Analyze cybersecurity risks",
    },
  ];

  const createdSubcategories = await Promise.all(
    subcategories.map((subcat, idx) =>
      prisma.subcategory.create({
        data: {
          categoryId: rmCategory!.id,
          code: subcat.code,
          name: subcat.name,
          description: subcat.description,
          displayOrder: idx,
        },
      })
    )
  );

  // Create assessment questions
  console.log("Creating assessment questions...");
  const questions = [
    {
      question: "Has the organization established cybersecurity risk management objectives?",
      guidance: "Document how risk management aligns with organizational objectives",
    },
    {
      question:
        "Does the organization have documented processes to identify cybersecurity risks?",
      guidance:
        "Include risk identification methodologies and frequency of identification activities",
    },
    {
      question:
        "Are identified cybersecurity risks formally analyzed and prioritized?",
      guidance: "Document risk analysis frameworks and prioritization criteria",
    },
  ];

  const createdQuestions = await Promise.all(
    questions.map((q, idx) =>
      prisma.assessmentQuestion.create({
        data: {
          subcategoryId: createdSubcategories[idx].id,
          question: q.question,
          guidance: q.guidance,
        },
      })
    )
  );

  // Create sample categories for other functions
  console.log("Creating additional NIST categories...");
  for (const func of createdFunctions) {
    if (func.code !== "GV") {
      await prisma.category.create({
        data: {
          functionId: func.id,
          code: `${func.code}.XX`,
          name: `${func.name} - Sample Category`,
          description: `Sample category for ${func.name}`,
        },
      });
    }
  }

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
  console.log("Demo Credentials:");
  console.log("================");
  console.log(`Admin (Platform):  admin@example.local`);
  console.log(`CISO:              ciso@example.local`);
  console.log(`Assessor:          assessor@example.local`);
  console.log(`Viewer:            viewer@example.local`);
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
