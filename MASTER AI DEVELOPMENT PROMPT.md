MASTER AI DEVELOPMENT PROMPT

Cybersecurity Maturity Assessment & Management Platform

Act as a Senior Enterprise Security Architect, Cybersecurity GRC Specialist, Full-Stack Software Architect, UX Designer, DevSecOps Engineer and Data Architect.

Design and implement a production-quality web application called:

Cybersecurity Maturity Management Platform — CMMP

The application will allow organisations to assess, measure, visualise, track and improve their cybersecurity maturity.

The initial primary framework is:

NIST Cybersecurity Framework CSF 2.0

However, the architecture MUST be framework-agnostic so that additional frameworks can later be enabled without redesigning the system.

Future supported frameworks should include:

* ISO/IEC 27001
* CIS Critical Security Controls
* NIST SP 800-53
* NIST AI RMF
* PCI DSS
* SWIFT CSCF
* DORA
* SOC 2
* COBIT
* Qatar NIA / QCB cybersecurity requirements
* Saudi NCA ECC
* Custom organisational security frameworks

⸻

1. PRODUCT OBJECTIVE

Build an enterprise cybersecurity maturity assessment platform that allows a CISO, Security Architect, Risk Manager, GRC team, Internal Audit team or Security Consultant to:

1. Create an organisation.
2. Create cybersecurity assessments.
3. Select a cybersecurity framework.
4. Upload assessment data using Excel/XLS/XLSX/CSV.
5. Perform assessment directly through the web interface.
6. Score cybersecurity maturity.
7. Define Current State and Target State.
8. Identify cybersecurity capability gaps.
9. Generate remediation initiatives.
10. Prioritise security investments.
11. Track cybersecurity roadmap progress.
12. Visualise cybersecurity posture through executive dashboards.
13. Drill down from executive-level maturity into individual controls.
14. Compare assessments over time.
15. Export reports.
16. Maintain evidence supporting maturity ratings.

The application should look like a modern enterprise security management product rather than a simple questionnaire.

Think of the product as a combination of:

* Cybersecurity GRC platform
* Security maturity assessment platform
* CISO dashboard
* Security roadmap management platform
* Enterprise architecture capability dashboard

⸻

2. PRIMARY FRAMEWORK — NIST CSF 2.0

Implement NIST CSF 2.0 using its hierarchy.

Top-level Functions:

GOVERN

IDENTIFY

PROTECT

DETECT

RESPOND

RECOVER

The system must support the complete hierarchical structure:

Framework

→ Function

→ Category

→ Subcategory / Outcome

→ Assessment Question

→ Evidence

→ Score

→ Gap

→ Recommendation

→ Remediation Initiative

Do NOT hard-code NIST directly into the application logic.

The framework must be stored as structured database/configuration data.

Example:

Framework
NIST-CSF-2.0

Function
GV — Govern

Category
GV.RM — Risk Management Strategy

Subcategory
GV.RM-01

Assessment Question
“Has the organisation established cybersecurity risk management objectives?”

The framework engine should therefore support additional frameworks later.

⸻

3. MATURITY MODEL

Implement the following maturity scale.

0 — Not Applicable

1 — Initial

2 — Developing

3 — Defined

4 — Managed

5 — Optimised

Descriptions:

1 — Initial

Processes are informal, reactive or inconsistently performed.

Controls may exist but depend heavily on individuals.

2 — Developing

Processes and controls have started to become documented but implementation remains inconsistent.

3 — Defined

Policies, standards and repeatable security processes are documented and implemented across the organisation.

4 — Managed

Security processes are measured, monitored and governed using metrics, automation and management oversight.

5 — Optimised

Security processes are continually improved, highly automated and integrated with enterprise risk management.

The scoring model MUST be configurable.

Never permanently embed the 1–5 scale into business logic.

Allow administrators later to create another maturity model.

⸻

4. ASSESSMENT SCORING

Each assessment item should contain:

* Framework
* Function
* Category
* Subcategory
* Assessment question
* Security capability
* Current maturity
* Target maturity
* Weight
* Risk rating
* Business criticality
* Control status
* Evidence
* Assessor comments
* Recommendation
* Remediation owner
* Remediation due date
* Status

Calculate:

Current maturity score

Target maturity score

Maturity gap

Weighted maturity score

Function maturity score

Category maturity score

Organisation maturity score

Risk-adjusted maturity score

Percentage compliance

Assessment completion percentage

For example:

Current maturity = 2

Target maturity = 4

Gap = 2

Display negative security gaps prominently.

⸻

5. MATURITY DASHBOARD

Create a modern executive dashboard.

The landing dashboard should include KPI cards:

Overall Security Maturity

Target Security Maturity

Overall Maturity Gap

Assessment Completion %

Critical Gaps

High-Risk Findings

Open Remediation Actions

Overdue Remediation Actions

Controls Meeting Target

Controls Below Target

⸻

6. NIST CSF FUNCTION DASHBOARD

Display six prominent maturity cards:

GOVERN

IDENTIFY

PROTECT

DETECT

RESPOND

RECOVER

Each card must show:

Current score

Target score

Gap

Assessment completion %

Number of high-risk gaps

Trend from previous assessment

Example:

PROTECT

Current: 2.8

Target: 4.2

Gap: 1.4

Completion: 92%

High-Risk Gaps: 8

Clicking a Function must drill down into Categories and Subcategories.

⸻

7. RADAR / SPIDER CHART

Create an executive radar chart displaying:

Govern

Identify

Protect

Detect

Respond

Recover

Show two datasets:

Current Maturity

Target Maturity

This should immediately show cybersecurity maturity gaps.

Allow toggling:

Current

Target

Previous Assessment

Industry Benchmark

⸻

8. MATURITY GAP CHART

Create a bar chart showing:

Function

Current Maturity

Target Maturity

Gap

Sort optionally by largest gap.

Example:

Govern       2.1 → 4.0

Identify     2.8 → 4.0

Protect      3.2 → 4.2

Detect       2.3 → 4.1

Respond      2.0 → 4.0

Recover      1.9 → 3.8

⸻

9. SECURITY MATURITY HEATMAP

Create an interactive heatmap.

Rows:

NIST categories

Columns:

Govern

Identify

Protect

Detect

Respond

Recover

Use maturity ratings.

Provide tooltips containing:

Category

Current score

Target score

Gap

Risk

Owner

Open remediation actions

The heatmap must be accessible and must not rely on colour alone.

Display numeric maturity levels as well.

⸻

10. MATURITY DISTRIBUTION

Create visualisations showing the percentage of controls rated:

Initial

Developing

Defined

Managed

Optimised

Allow filtering by:

Framework

Function

Department

Business Unit

Security Domain

Risk Level

Assessment

⸻

11. CYBERSECURITY CAPABILITY VIEW

Create a capability-based view independent of NIST.

Example capabilities:

Governance

Security Strategy

Cyber Risk Management

Enterprise Security Architecture

Identity & Access Management

Privileged Access Management

Network Security

Cloud Security

Endpoint Security

Application Security

DevSecOps

Data Security

Cryptography & Key Management

Vulnerability Management

Threat Intelligence

Security Monitoring

SIEM

SOAR

SOC

Incident Response

Business Continuity

Disaster Recovery

Third-Party Risk

Security Awareness

Asset Management

Configuration Management

AI Security

Each capability should contain:

Current maturity

Target maturity

Gap

Technology

Processes

People

Related NIST controls

Risks

Projects

Owner

⸻

12. SECURITY TOOL MAPPING

Allow cybersecurity technologies to be mapped to security capabilities.

Examples:

Active Directory
→ Identity & Access Management

Microsoft Entra ID
→ Identity & Access Management

Microsoft Defender
→ Endpoint / Cloud / Threat Protection

Microsoft Sentinel
→ SIEM / SOC

Microsoft Intune
→ Endpoint Management

Delinea
→ Privileged Access Management

CyberArk
→ Privileged Access Management

Palo Alto
→ Network Security

Fortinet
→ Network Security

CrowdStrike
→ Endpoint Detection & Response

Tenable
→ Vulnerability Management

Qualys
→ Vulnerability Management

Splunk
→ SIEM

The platform should therefore answer:

“What technology currently supports this security capability?”

and:

“Which security capabilities have insufficient tooling?”

⸻

13. CURRENT-STATE SECURITY ARCHITECTURE VIEW

Create a page called:

Security Capability Landscape

Display security capabilities grouped into:

Governance

Protect

Detect

Respond

Recover

Platform Security

Security Operations

Each capability should show:

Maturity

Technology currently used

Technology utilisation

Risk

Strategic importance

Target maturity

⸻

14. EXCEL / XLSX IMPORT

For the MVP, allow users to upload:

.xlsx

.xls

.csv

Provide drag-and-drop upload.

The application must parse the spreadsheet and validate records.

Expected columns:

Framework

Function

Category

Subcategory

Control_ID

Assessment_Question

Current_Maturity

Target_Maturity

Weight

Risk

Business_Criticality

Evidence

Comments

Recommendation

Owner

Due_Date

Status

Support flexible column mapping.

For example, if Excel contains:

“Current Score”

allow the user to map it to:

Current_Maturity

Create an import wizard:

Step 1 — Upload file

Step 2 — Select worksheet

Step 3 — Map columns

Step 4 — Validate data

Step 5 — Preview assessment

Step 6 — Import

Display:

valid records

warning records

invalid records

Duplicate records

Never silently discard bad data.

Produce a downloadable error report for rejected records.

⸻

15. ASSESSMENT WORKSPACE

Create a detailed assessment screen.

Use a table with:

Control ID

Function

Category

Assessment Question

Current Maturity

Target Maturity

Gap

Risk

Evidence

Owner

Status

Allow inline editing.

Allow filters.

Allow sorting.

Allow bulk updates.

Allow search.

Allow saving draft responses.

Allow assessment progress to be displayed.

⸻

16. CONTROL DETAIL PAGE

Clicking an assessment item should open a detailed side panel or page.

Display:

Control ID

Framework reference

Function

Category

Assessment statement

Current maturity

Target maturity

Gap

Risk rating

Assessment rationale

Evidence

Supporting documents

Assessor

Assessment date

Recommendations

Remediation activities

Related technologies

Related policies

Related risks

Audit history

⸻

17. EVIDENCE MANAGEMENT

Users should eventually be able to attach evidence such as:

Policies

Screenshots

Architecture diagrams

Configuration exports

Audit reports

Penetration test reports

Security reports

URLs

For MVP:

Store metadata and filenames.

Architect the storage interface so object-storage integration can later support:

Azure Blob Storage

AWS S3

Google Cloud Storage

⸻

18. RISK REGISTER INTEGRATION

Create a Risk Register module.

Fields:

Risk ID

Risk Title

Description

Threat

Vulnerability

Affected Asset

Business Impact

Likelihood

Impact

Inherent Risk

Existing Controls

Residual Risk

Risk Owner

Risk Treatment

Target Date

Status

Related NIST Controls

Related Capabilities

Related Remediation Projects

Allow assessment gaps to automatically create proposed cybersecurity risks.

⸻

19. REMEDIATION ROADMAP

Create a Cybersecurity Improvement Roadmap page.

Every significant maturity gap can generate an improvement initiative.

Fields:

Initiative ID

Title

Description

Security Capability

NIST Function

NIST Category

Risk

Current Maturity

Target Maturity

Priority

Owner

Estimated Cost

Complexity

Start Date

Target Completion Date

Status

Dependencies

Create views for:

Quick Wins

Strategic Projects

Critical Projects

Planned

In Progress

Completed

⸻

20. ROADMAP PRIORITISATION

Calculate recommended remediation priority using:

Risk Severity

Maturity Gap

Business Criticality

Control Weight

Implementation Complexity

Allow administrators to configure the formula.

Example:

Priority Score =
Risk × Gap × Business Criticality × Weight

Do not permanently hard-code this formula.

⸻

21. ROADMAP VISUALISATION

Create:

12-month roadmap

24-month roadmap

36-month roadmap

Display initiatives grouped into:

Immediate — 0–3 months

Short Term — 3–6 months

Medium Term — 6–12 months

Strategic — 12–36 months

Provide timeline/Gantt-style visualisation.

⸻

22. TREND DASHBOARD

Track maturity changes between assessments.

Example:

Q1 2026 — 2.1

Q2 2026 — 2.4

Q3 2026 — 2.8

Q4 2026 — 3.1

Create line charts showing security maturity improvement.

Allow comparison:

Assessment vs previous assessment

Year vs year

Business unit vs business unit

Current vs target

⸻

23. EXECUTIVE DASHBOARD

Create a separate CISO / Board dashboard.

It should intentionally contain less technical information.

Show:

Enterprise Security Maturity

Target Security Maturity

Top Cyber Risks

Largest Maturity Gaps

Cybersecurity Roadmap Progress

Overdue High-Risk Actions

Security Investment Priorities

Maturity Trend

Top Improving Capabilities

Top Deteriorating Capabilities

⸻

24. DRILL-DOWN NAVIGATION

The navigation hierarchy should work as:

Organisation

→ Assessment

→ Framework

→ Function

→ Category

→ Subcategory

→ Assessment Question

→ Evidence / Findings

→ Recommendation

→ Remediation Initiative

Users must always be able to understand where a score originated.

⸻

25. FILTERING

Global dashboard filtering must include:

Organisation

Assessment

Assessment Date

Framework

Business Unit

Department

Country

Function

Category

Security Capability

Risk Level

Control Owner

Status

⸻

26. USER ROLES

Implement RBAC.

Roles:

Platform Administrator

Organisation Administrator

CISO

Security Architect

GRC Manager

Assessor

Control Owner

Remediation Owner

Auditor

Executive Viewer

Read-Only Viewer

Design permissions around least privilege.

⸻

27. MULTI-TENANCY

Architect for SaaS multi-tenancy.

Every major object must belong to a Tenant / Organisation.

Example:

tenant_id

organisation_id

Never allow one tenant to access another tenant’s data.

Enforce tenancy at:

Application layer

API layer

Database query layer

Automated tests

⸻

28. AUDIT LOGGING

Create immutable-style audit logging for:

Login

Logout

Assessment creation

Score change

Evidence upload

Risk update

Recommendation update

User creation

Role change

Framework configuration

Excel upload

Report generation

Store:

Actor

Timestamp

Action

Resource

Previous value

New value

IP where available

Correlation ID

⸻

29. TECHNICAL ARCHITECTURE

Preferred stack:

Frontend:

Next.js

TypeScript

React

Tailwind CSS

shadcn/ui

Charts:

Recharts or equivalent mature React chart library

Backend:

Next.js API routes or NestJS

For a clean enterprise architecture, preferably use:

Frontend
Next.js

Backend
NestJS

API
REST

Database
PostgreSQL

ORM
Prisma

Authentication
NextAuth/Auth.js or enterprise-ready OIDC integration

Validation
Zod

Data import
SheetJS / ExcelJS

Testing:

Jest

React Testing Library

Playwright

Infrastructure:

Docker

Docker Compose

GitHub Actions

⸻

30. REPOSITORY STRUCTURE

Prefer a monorepo structure such as:

/apps

/apps/web

/apps/api

/packages

/packages/ui

/packages/database

/packages/security

/packages/framework-engine

/packages/scoring-engine

/packages/shared

/packages/import-engine

/packages/reporting

/docs

/infrastructure

/.github/workflows

⸻

31. DATABASE MODEL

Design normalized entities including:

Tenant

Organisation

User

Role

Permission

UserRole

Framework

FrameworkVersion

Function

Category

Subcategory

AssessmentTemplate

Assessment

AssessmentItem

AssessmentResponse

MaturityModel

MaturityLevel

Evidence

SecurityCapability

Technology

CapabilityTechnology

Risk

Recommendation

RemediationInitiative

AssessmentHistory

ImportJob

ImportRecord

AuditEvent

DashboardConfiguration

Benchmark

Use UUID primary keys.

Use created_at and updated_at fields.

Use soft deletion where appropriate.

⸻

32. API DESIGN

Create REST endpoints similar to:

GET /api/frameworks

GET /api/frameworks/:id

GET /api/frameworks/:id/functions

GET /api/frameworks/:id/categories

POST /api/assessments

GET /api/assessments/:id

PUT /api/assessments/:id

GET /api/assessments/:id/results

GET /api/assessments/:id/gaps

POST /api/assessments/import

POST /api/evidence

GET /api/dashboard/executive

GET /api/dashboard/maturity

GET /api/risks

POST /api/risks

GET /api/roadmap

POST /api/roadmap

Use API versioning:

/api/v1/

Generate OpenAPI documentation.

⸻

33. SCORING ENGINE

Create a standalone scoring service.

It must calculate:

Item maturity

Category maturity

Function maturity

Capability maturity

Framework maturity

Organisation maturity

Weighted maturity

Current maturity

Target maturity

Gap

Trend

Do not put scoring calculations directly inside React components.

Create reusable functions and unit tests.

⸻

34. FRAMEWORK ENGINE

Create an extensible Framework Engine.

Framework definitions should be loadable from JSON or database records.

Example concept:

framework:
id: nist-csf-2
version: “2.0”

functions:

* GV
* ID
* PR
* DE
* RS
* RC

The UI must dynamically generate navigation, assessments and dashboards from framework configuration.

Avoid framework-specific if/else statements.

⸻

35. REPORTING

Generate reports including:

Executive Security Maturity Report

Detailed NIST CSF Assessment

Gap Analysis Report

Cybersecurity Risk Report

Security Roadmap Report

Board Cybersecurity Report

Reports should eventually export as:

PDF

Excel

CSV

For MVP, implement CSV and Excel first.

⸻

36. SAMPLE DATA

Create realistic synthetic assessment data.

DO NOT use perfect or uniform scores.

Example:

Govern: 2.2

Identify: 3.1

Protect: 2.8

Detect: 2.4

Respond: 2.1

Recover: 1.9

Target values should typically range between:

3.5–4.5

Create approximately 50–100 sample assessment records so dashboards look realistic.

⸻

37. USER EXPERIENCE

The application should look comparable to a modern enterprise SaaS cybersecurity product.

Design characteristics:

Professional

Clean

Executive friendly

Dark-mode capable

Responsive

Accessible

Data dense without being cluttered

Avoid excessive gradients.

Use cards, charts and whitespace carefully.

Provide left-side navigation.

Example navigation:

Dashboard

Assessments

Frameworks

Capabilities

Risks

Roadmap

Evidence

Reports

Administration

⸻

38. HOME DASHBOARD LAYOUT

Recommended layout:

Top:

Organisation selector

Assessment selector

Framework selector

Assessment date

Second row:

Overall Maturity

Target

Gap

Completion

Critical Risks

Third row:

Large Radar Chart

Maturity Gap Chart

Fourth row:

Six NIST Function cards

Fifth row:

Security Maturity Heatmap

Sixth row:

Top 10 Maturity Gaps

Seventh row:

Roadmap Progress

Eighth row:

Maturity Trend

⸻

39. SECURITY REQUIREMENTS

Apply Secure-by-Design principles.

Implement:

OWASP ASVS-aligned security principles

OWASP Top 10 mitigations

Strict server-side input validation

Output encoding

Parameterized database access

CSRF protection where applicable

CSP headers

HSTS

Secure cookies

HttpOnly cookies

SameSite

Secure session handling

Rate limiting

Authentication protection

Authorization on every protected resource

Tenant isolation

File validation

Maximum upload size

MIME validation

Spreadsheet formula injection protection

Malicious spreadsheet protection

Secure error handling

No sensitive information in application logs

Secrets through environment variables only

Never commit secrets.

⸻

40. EXCEL SECURITY

Because the application accepts spreadsheet uploads, explicitly defend against:

Formula injection

CSV injection

Extremely large files

Zip bombs

Malformed XLSX files

Unexpected MIME types

Malicious filenames

Path traversal

Dangerous embedded objects

Reject or sanitise spreadsheet cells beginning with dangerous formula characters when exported.

Do not execute macros.

⸻

41. DEVSECOPS / CI/CD

Create GitHub Actions pipelines.

Create:

.github/workflows/ci.yml

.github/workflows/security.yml

.github/workflows/dast.yml

.github/workflows/deploy.yml

⸻

42. CI PIPELINE

On pull request:

Install dependencies

Lint

Type check

Run unit tests

Run integration tests

Build frontend

Build backend

Generate test coverage

Run security scanning

Pull Requests must fail if mandatory security gates fail.

⸻

43. SAST

Configure Static Application Security Testing.

Preferred:

GitHub CodeQL

Scan:

TypeScript

JavaScript

GitHub Actions workflow code where supported

Use security-focused query suites where appropriate.

Security findings should appear in GitHub security/code scanning.

Run:

On pull request

On push to main

Weekly scheduled scan

Fail or block according to configurable security severity policy.

⸻

44. DEPENDENCY SECURITY

Add dependency vulnerability scanning.

Use:

Dependabot

npm audit or appropriate package audit tooling

Optional OSV Scanner

Configure Dependabot for:

npm packages

GitHub Actions

Docker dependencies

Create automatic dependency update Pull Requests.

⸻

45. SECRET SCANNING

Add secret detection.

Use:

Gitleaks

and GitHub secret scanning where available.

Fail CI when verified secrets or high-confidence secrets are discovered.

Never expose discovered secrets in CI console output.

⸻

46. CONTAINER SCANNING

If Docker images are generated:

Build container.

Run Trivy vulnerability scanning.

Generate SARIF where supported.

Upload security results to GitHub security tooling.

Do not deploy images containing critical vulnerabilities unless explicitly waived.

⸻

47. SOFTWARE BILL OF MATERIALS

Generate an SBOM during CI.

Prefer CycloneDX or SPDX.

Store SBOM as a pipeline artifact.

Generate the SBOM for every release.

⸻

48. DAST

Configure Dynamic Application Security Testing.

Use:

OWASP ZAP

Pipeline behaviour:

Build application

Launch application in isolated test environment

Wait for health endpoint

Run database migrations

Seed safe synthetic data

Run OWASP ZAP baseline scan

Store ZAP report

Fail pipeline according to configured severity threshold

Never run active destructive scanning against production.

DAST should run:

Nightly

Before production releases

Optionally against preview/staging environments

⸻

49. SECURITY CI/CD FLOW

Implement:

Developer Commit

↓

Pull Request

↓

Lint / Unit Tests

↓

SAST — CodeQL

↓

Secret Scan — Gitleaks

↓

Dependency Scan

↓

Build

↓

Container Scan — Trivy

↓

Integration Tests

↓

Deploy Ephemeral Test Environment

↓

DAST — OWASP ZAP

↓

Security Gate

↓

Approval

↓

Deploy Staging

↓

Smoke Tests

↓

Production Approval

↓

Production

⸻

50. BRANCH SECURITY

Document required GitHub settings:

Protect main branch.

Require Pull Requests.

Require at least one review.

Require CI checks.

Require security checks.

Prevent force push.

Prevent branch deletion.

Require conversation resolution.

Use CODEOWNERS.

Create:

.github/CODEOWNERS

Security-sensitive directories should require security-team review where appropriate.

⸻

51. SECURITY GATES

Create configurable pipeline security gates.

Example:

Critical vulnerabilities = fail

High vulnerabilities = fail

Medium vulnerabilities = warning initially

Secrets = fail

Failed unit tests = fail

Failed SAST = fail according to policy

Failed DAST high-risk finding = fail

Container critical vulnerability = fail

The thresholds must be configurable.

⸻

52. ENVIRONMENTS

Support:

Local

Development

Test

Staging

Production

Use environment-specific configuration.

Never store production secrets in repository files.

⸻

53. OBSERVABILITY

Implement structured application logging.

Prepare interfaces for:

Application metrics

Audit metrics

Security events

Error monitoring

Request tracing

Use correlation IDs.

Health endpoints:

/health

/ready

Do not expose sensitive configuration through health endpoints.

⸻

54. ARCHITECTURE DOCUMENTATION

Generate documentation under:

/docs

Include:

architecture.md

security-architecture.md

data-model.md

api-design.md

scoring-model.md

framework-model.md

threat-model.md

deployment.md

devsecops.md

excel-import-format.md

⸻

55. THREAT MODEL

Produce a STRIDE threat model for the platform.

At minimum consider:

Authentication attacks

Broken access control

Cross-tenant access

Privilege escalation

Spreadsheet upload attacks

Malicious documents

SQL injection

XSS

CSRF

SSRF

API abuse

Credential theft

Session hijacking

Data exfiltration

Evidence tampering

Assessment score manipulation

Audit-log manipulation

CI/CD compromise

Dependency compromise

Secret leakage

Container compromise

For each threat document:

Threat

Affected component

Attack scenario

Likelihood

Impact

Risk

Mitigation

Residual risk

⸻

56. ARCHITECTURE DIAGRAMS

Generate Mermaid diagrams for:

System Context

Container Architecture

Component Architecture

Authentication Flow

Assessment Data Flow

Excel Import Flow

Framework Engine

Scoring Engine

CI/CD Security Pipeline

Deployment Architecture

Example conceptual architecture:

User

↓

Next.js Web UI

↓

API Gateway / Backend API

↓

Authentication / Authorization

↓

Assessment Service
Framework Service
Scoring Service
Risk Service
Roadmap Service
Reporting Service

↓

PostgreSQL

↓

Object Storage

⸻

57. TESTING

Implement:

Unit tests

API tests

Integration tests

UI component tests

End-to-end tests

Security tests

Tenant-isolation tests

Authorization tests

Excel-import validation tests

Scoring-engine tests

Important test cases:

User from Tenant A cannot access Tenant B.

Viewer cannot modify assessment.

Assessor cannot change administration settings.

Maturity calculation is correct.

Invalid maturity values are rejected.

Malformed spreadsheets are rejected.

Oversized files are rejected.

Formula injection is sanitised.

⸻

58. DEMO LOGIN

For local development only, create seeded users such as:

admin@example.local

ciso@example.local

assessor@example.local

viewer@example.local

Do NOT use default passwords in production.

Development credentials must clearly be marked as non-production.

⸻

59. FIRST MVP RELEASE

The first usable version MUST include:

Login

Organisation

NIST CSF 2.0 framework

Assessment creation

Excel upload

Column mapping

Assessment validation

Assessment table

Current maturity

Target maturity

Gap calculation

Overall maturity calculation

NIST Function maturity calculation

Executive dashboard

Radar chart

Maturity gap chart

Function cards

Heatmap

Top gaps table

Risk register

Remediation actions

Basic roadmap

CSV/Excel report export

Audit logging

RBAC

Docker

GitHub Actions

SAST

Dependency scanning

Secret scanning

DAST

Unit tests

Integration tests

E2E tests

⸻

60. SECOND RELEASE

Prepare architecture for:

Multiple organisations

Multiple frameworks

Framework mappings

ISO 27001

CIS Controls

Benchmarking

Security technology inventory

Security capability model

AI-generated recommendations

AI-generated executive summaries

Automated evidence evaluation

API integrations

SIEM integration

CMDB integration

ServiceNow integration

Microsoft Defender integration

Microsoft Sentinel integration

Tenable integration

Qualys integration

CrowdStrike integration

Cloud security platforms

⸻

61. FUTURE AI MODULE

Do NOT make automated AI decisions about maturity scores without human approval.

However, design an optional future AI Security Advisor.

It could:

Analyse assessment evidence

Suggest maturity scores

Identify missing controls

Suggest remediation actions

Generate executive summaries

Prioritise gaps

Identify related risks

Map technologies to capabilities

Recommend roadmap initiatives

Every AI recommendation must include:

Recommendation

Reason

Supporting evidence

Confidence score

Human approval status

Never silently overwrite assessor ratings.

⸻

62. BENCHMARKING

Architect future benchmarking.

Potential views:

Organisation maturity vs target

Organisation maturity vs previous year

Business Unit A vs Business Unit B

Organisation vs anonymised benchmark

Industry maturity vs organisation

Benchmark data must be clearly labelled and never fabricated.

⸻

63. IMPORTANT DEVELOPMENT RULES

Follow these engineering principles:

SOLID

DRY

Separation of concerns

Domain-driven modular design

Secure by Design

Privacy by Design

Least Privilege

Zero Trust

Defence in Depth

Never place business logic directly in UI components.

Never trust frontend validation.

Validate authorization server-side.

Do not hard-code framework data into components.

Do not hard-code maturity scoring.

Do not hard-code security thresholds.

Use configuration and database-driven models.

⸻

64. UI QUALITY REQUIREMENT

This must NOT look like a student project.

Produce an enterprise-grade UI appropriate for presentation to:

CISO

CIO

CTO

Board

Internal Audit

Regulators

Security Architects

Use professional typography, layout, charts and dashboards.

Pay particular attention to executive readability.

⸻

65. DEVELOPMENT EXECUTION ORDER

Build the project in this order:

Phase 1

Architecture and repository structure

Phase 2

Database schema

Phase 3

Authentication and RBAC

Phase 4

Framework Engine

Phase 5

NIST CSF framework data

Phase 6

Assessment engine

Phase 7

Scoring engine

Phase 8

Excel import engine

Phase 9

Dashboard APIs

Phase 10

Dashboard UI

Phase 11

Risk register

Phase 12

Remediation roadmap

Phase 13

Audit logging

Phase 14

Tests

Phase 15

Docker

Phase 16

CI/CD security pipeline

Phase 17

Documentation

Do not try to generate the whole application in one uncontrolled code dump.

Build module by module.

After each major phase:

Run tests.

Fix compilation problems.

Fix linting problems.

Check security boundaries.

Update documentation.

⸻

66. EXPECTED OUTPUT FROM THE AI CODING AGENT

Before coding, provide:

1. Proposed solution architecture.
2. Repository structure.
3. Database ER model.
4. Application modules.
5. Security architecture.
6. Scoring methodology.
7. CI/CD architecture.
8. Threat model summary.

Then generate the implementation.

The project should run locally with approximately:

git clone

cp .env.example .env

docker compose up

Database migration and seed scripts must be included.

Provide a README containing complete setup instructions.

⸻

FINAL OBJECTIVE

The finished system should enable an organisation to upload cybersecurity assessment data and immediately transform that information into an interactive cybersecurity maturity view showing:

Current Cybersecurity Posture

↓

NIST CSF Function Maturity

↓

Security Capability Maturity

↓

Control-Level Gaps

↓

Cybersecurity Risks

↓

Recommended Improvements

↓

Prioritised Remediation Roadmap

↓

Target Cybersecurity Posture

The platform must be suitable as the foundation of a genuine enterprise Cybersecurity Maturity Management and CISO decision-support product rather than simply a questionnaire application.


67. GITHUB INTEGRATION AND AUTONOMOUS DEVELOPMENT

The AI coding agent should integrate directly with my GitHub account, where supported by the development environment and after I provide the required GitHub authorization.

The objective is NOT merely to generate source code in the conversation.

The objective is to create, maintain and progressively build the actual application inside GitHub.

The AI agent should:

* Connect to my authenticated GitHub account.
* Create a new GitHub repository for the project if one does not already exist.
* Suggest an appropriate repository name such as:

cybersecurity-maturity-platform

* Initialize the repository.
* Create the required directory structure.
* Create all application source files.
* Create configuration files.
* Create Docker configuration.
* Create database migrations.
* Create seed data.
* Create documentation.
* Create GitHub Actions workflows.
* Create security scanning configuration.
* Commit the implementation to GitHub.
* Push changes to GitHub.
* Create feature branches where appropriate.
* Create Pull Requests.
* Run GitHub Actions.
* Review CI/CD results.
* Fix build failures.
* Fix test failures.
* Fix linting errors.
* Fix security scan failures.
* Continue iterating until the defined MVP is functional.

Do not stop after generating an initial project skeleton.

Continue implementing the application according to the defined development phases.

⸻

68. GITHUB REPOSITORY INITIALIZATION

When GitHub access is available:

1. Check whether the project repository already exists.
2. If it does not exist, create:

cybersecurity-maturity-platform

3. Add:

README.md

LICENSE

.gitignore

.env.example

docker-compose.yml

Dockerfiles

.github/

docs/

apps/

packages/

infrastructure/

4. Initialize the main branch.
5. Configure development branches.

Recommended branch model:

main

develop

feature/*

fix/*

security/*

6. Never commit credentials, API keys, access tokens, passwords or production secrets.

⸻

69. GITHUB PROJECT DEVELOPMENT WORKFLOW

Use an iterative engineering workflow.

For each significant capability:

Create branch

↓

Implement functionality

↓

Add tests

↓

Run lint

↓

Run type checking

↓

Run unit tests

↓

Run security checks

↓

Build application

↓

Commit changes

↓

Push branch

↓

Create Pull Request

↓

Run GitHub Actions

↓

Review failures

↓

Fix issues

↓

Re-run pipeline

↓

Merge once quality gates pass

Prefer small, understandable Pull Requests rather than one enormous implementation PR.

⸻

70. CONTINUOUS DEVELOPMENT INSTRUCTION

IMPORTANT:

Do not stop unnecessarily after completing an individual module.

Continue to the next planned implementation phase automatically when:

* Requirements are sufficiently defined.
* Tests pass.
* Security controls pass.
* No architectural decision requires explicit human input.
* No destructive action requires approval.
* No credentials or external permissions are missing.

The AI agent should continuously progress through the development roadmap.

For example:

Architecture

↓

Repository initialization

↓

Database

↓

Authentication

↓

RBAC

↓

Framework Engine

↓

NIST CSF

↓

Assessment Engine

↓

Scoring Engine

↓

Excel Import

↓

Dashboard

↓

Risk Register

↓

Roadmap

↓

Reporting

↓

Security

↓

Testing

↓

CI/CD

↓

Documentation

↓

MVP readiness review

Do not repeatedly ask:

“Would you like me to continue?”

Instead, continue to the next logical development task.

Only request user intervention when genuinely required, for example:

* GitHub authentication is required.
* Cloud credentials are required.
* A business decision cannot reasonably be inferred.
* A potentially destructive operation requires approval.
* Production deployment requires authorization.

⸻

71. GITHUB ACTIONS

Automatically create:

.github/workflows/ci.yml

.github/workflows/security.yml

.github/workflows/dast.yml

.github/workflows/container-security.yml

.github/workflows/release.yml

.github/workflows/deploy-staging.yml

Prepare:

.github/dependabot.yml

.github/CODEOWNERS

Pull Request templates

Issue templates

Security reporting instructions

⸻

72. SECURITY PIPELINE EXECUTION

The AI agent must not merely create the security pipelines.

It should also execute and validate them through GitHub Actions where GitHub access permits.

Check:

SAST

CodeQL

Dependency vulnerabilities

Secret scanning

Gitleaks

Trivy

SBOM generation

Unit tests

Integration tests

E2E tests

OWASP ZAP DAST

Docker build

Application build

If the pipeline fails:

Inspect the failure.

Determine the root cause.

Correct the source/configuration.

Commit the correction.

Push the change.

Allow GitHub Actions to execute again.

Continue this cycle until the required quality gates pass.

Do not bypass security controls simply to make the pipeline green.

⸻

73. SECURITY FINDING REMEDIATION

When SAST, DAST, dependency scanning or another security tool produces findings:

Classify the finding.

Determine whether it is:

True Positive

False Positive

Accepted Risk

Dependency Issue

Configuration Issue

Application Vulnerability

Where possible, remediate True Positive vulnerabilities automatically.

Examples:

SQL Injection
→ Parameterized queries.

XSS
→ Context-aware output encoding.

Broken Access Control
→ Server-side authorization.

Vulnerable dependency
→ Upgrade dependency.

Container vulnerability
→ Upgrade base image/package.

Secret discovered
→ Remove secret and move to secure environment configuration.

Never suppress security findings merely to pass CI/CD without documented justification.

⸻

74. GITHUB ISSUES

Use GitHub Issues as the engineering backlog.

Create issues for major modules such as:

Architecture

Database Model

Authentication

RBAC

Framework Engine

NIST CSF Import

Assessment Engine

Scoring Engine

Excel Import

Executive Dashboard

Risk Register

Remediation Roadmap

Reporting

Audit Logging

SAST

DAST

Container Security

Testing

Documentation

Tag issues appropriately.

Example labels:

architecture

frontend

backend

database

security

devsecops

bug

feature

risk

documentation

testing

high-priority

MVP

⸻

75. DEVELOPMENT TRACKING

Maintain a project implementation status document:

docs/IMPLEMENTATION_STATUS.md

Include:

Completed

In Progress

Planned

Blocked

Security Findings

Technical Debt

Architecture Decisions

Outstanding Dependencies

Update this file as the project evolves.

The AI agent should use it as a persistent development checkpoint.

⸻

76. ARCHITECTURE DECISION RECORDS

Create:

docs/adr/

Use Architecture Decision Records for significant choices.

Example:

ADR-001 — Monorepo architecture

ADR-002 — Next.js frontend

ADR-003 — NestJS backend

ADR-004 — PostgreSQL database

ADR-005 — Prisma ORM

ADR-006 — Framework-agnostic assessment engine

ADR-007 — Configurable maturity scoring

ADR-008 — Multi-tenant architecture

ADR-009 — Authentication strategy

ADR-010 — GitHub DevSecOps pipeline

Each ADR should contain:

Context

Decision

Alternatives

Security implications

Consequences

Status

⸻

77. README STATUS

Keep README.md current.

It should include:

Project overview

Architecture

Technology stack

Repository structure

Local setup

Environment variables

Docker setup

Database migrations

Seed data

Testing

GitHub Actions

Security scanning

Development workflow

Deployment

Documentation links

Current implementation status

⸻

78. PERSISTENT AI DEVELOPMENT BEHAVIOUR

Treat this project as an ongoing software engineering engagement rather than a one-time code generation exercise.

Whenever the AI coding environment resumes work on the repository:

1. Pull the latest repository state.
2. Read:

README.md

docs/IMPLEMENTATION_STATUS.md

relevant ADRs

open issues

recent Pull Requests

GitHub Actions results

3. Determine the next incomplete development task.
4. Continue implementation from that point.
5. Run tests.
6. Run security checks.
7. Commit completed work.
8. Push changes.
9. Update implementation status.
10. Continue with the next task.

Do not regenerate the application from scratch each time.

Use the repository as the authoritative source of project state.

⸻

79. AUTONOMY RULE

Proceed autonomously wherever reasonably possible.

Do not ask for confirmation between ordinary engineering steps.

Examples where confirmation is NOT required:

Creating source files

Creating tests

Refactoring code

Creating development branches

Running unit tests

Fixing compilation errors

Fixing lint errors

Fixing test failures

Updating documentation

Adding safe development dependencies

Creating GitHub Actions

Improving code quality

Fixing security vulnerabilities

Examples where approval MAY be required:

Deleting significant production data

Destroying infrastructure

Changing production DNS

Deploying into a live production environment

Purchasing paid services

Rotating production secrets

Changing security policies with significant organisational impact

⸻

80. DEFINITION OF DONE

The AI agent must continue development until the MVP reaches the following state:

Application builds successfully.

Docker environment starts successfully.

Database migrations execute successfully.

NIST CSF assessment is available.

Excel/XLSX import works.

Assessment scoring works.

Current vs Target maturity works.

Dashboards render correctly.

Risk Register works.

Remediation Roadmap works.

RBAC works.

Tenant isolation tests pass.

Audit logging works.

Unit tests pass.

Integration tests pass.

E2E tests pass.

SAST completes successfully.

Dependency scanning completes successfully.

Secret scanning completes successfully.

Container scanning completes successfully.

DAST completes according to configured security thresholds.

GitHub Actions pipelines are operational.

Documentation is complete enough for another engineer to clone and run the project.

Only after these MVP requirements are met should the project be considered ready for MVP review.

⸻

81. FINAL GITHUB DELIVERY EXPECTATION

The final output should NOT simply be a collection of code snippets.

The expected deliverable is a working GitHub repository containing:

Application source code

Frontend

Backend

Database

NIST CSF framework data

Scoring engine

Excel import

Dashboards

Risk Register

Roadmap

Tests

Docker

CI/CD

SAST

DAST

Dependency scanning

Secret scanning

Container scanning

SBOM

Documentation

Architecture diagrams

Threat model

ADRs

GitHub Issues

Implementation status

Release notes

The GitHub repository should become the single source of truth for the application.

Once authenticated access to GitHub is available, actively create and maintain these resources there rather than merely describing what should be created.

Continue progressing through the implementation plan until the MVP definition of done has been reached or an actual external dependency prevents further progress.