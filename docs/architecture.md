# CMMP System Architecture

## Overview

The Cybersecurity Maturity Management Platform (CMMP) is designed as a modern, scalable, multi-tenant SaaS application using industry-standard enterprise architecture patterns.

## System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          External Users                              │
│  (CISO, Security Architect, Risk Manager, GRC Team, Auditor)       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │   CMMP Platform    │
                    │  (Web Application) │
                    └────────┬───────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Authentication │  │   Assessment     │  │   Reporting      │
│    Service       │  │    Service       │  │    Service       │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               ▼
                      ┌────────────────────┐
                      │  PostgreSQL DB     │
                      │  (Multi-tenant)    │
                      └────────────────────┘
```

## Container Architecture

### Services

#### 1. **Next.js Web Application** (Frontend)
- **Port**: 3000
- **Purpose**: User interface for assessments, dashboards, reporting
- **Technology**: React + Next.js + Tailwind CSS
- **Key Features**:
  - Server-side rendering for performance
  - API data fetching on the server
  - Static generation for dashboards
  - Real-time chart visualizations

#### 2. **NestJS API Server** (Backend)
- **Port**: 3001
- **Purpose**: Business logic, authentication, scoring
- **Technology**: NestJS + Express
- **Key Features**:
  - RESTful API endpoints
  - Input validation with Zod
  - Authorization middleware
  - Scoring engine integration
  - Framework engine integration

#### 3. **PostgreSQL Database**
- **Port**: 5432
- **Purpose**: Persistent data storage
- **Technology**: PostgreSQL 15+
- **Features**:
  - UUID primary keys
  - Soft deletion support
  - Audit logging tables
  - Full-text search capability

#### 4. **Redis Cache** (Future)
- **Port**: 6379
- **Purpose**: Session management, caching
- **Technology**: Redis 7+
- **Use Cases**:
  - Session store
  - Assessment calculation cache
  - Rate limiting counters

## Component Architecture

### Frontend Components

```
Next.js Application
├── pages/
│   ├── _app.tsx                 # Layout wrapper
│   ├── index.tsx                # Dashboard landing
│   ├── assessments/
│   │   ├── index.tsx            # Assessment list
│   │   ├── [id]/                # Assessment detail
│   │   └── create.tsx           # Assessment creation
│   ├── frameworks/              # Framework management
│   ├── risks/                   # Risk register
│   ├── roadmap/                 # Remediation roadmap
│   ├── reports/                 # Report generation
│   └── admin/                   # Administration
├── components/
│   ├── dashboard/               # Dashboard components
│   │   ├── OverviewCards.tsx
│   │   ├── RadarChart.tsx
│   │   ├── MaturityGapChart.tsx
│   │   ├── FunctionCards.tsx
│   │   └── Heatmap.tsx
│   ├── assessments/             # Assessment components
│   ├── shared/                  # Reusable components
│   └── layout/                  # Layout components
├── lib/
│   ├── api.ts                   # API client
│   ├── auth.ts                  # Auth configuration
│   ├── hooks/                   # Custom React hooks
│   └── utils/                   # Utility functions
└── public/                      # Static assets
```

### Backend Services

```
NestJS API
├── src/
│   ├── main.ts                  # Application entry point
│   ├── app.module.ts            # Root module
│   ├── auth/                    # Authentication
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   └── jwt.strategy.ts
│   ├── assessments/             # Assessment management
│   │   ├── assessments.module.ts
│   │   ├── assessments.controller.ts
│   │   ├── assessments.service.ts
│   │   └── dto/
│   ├── frameworks/              # Framework management
│   ├── scoring/                 # Scoring calculations
│   ├── risks/                   # Risk management
│   ├── roadmap/                 # Roadmap management
│   ├── import/                  # Excel/CSV import
│   ├── reporting/               # Report generation
│   ├── audit/                   # Audit logging
│   ├── middleware/              # Custom middleware
│   └── prisma/                  # Database integration
└── test/                        # Test files
```

### Shared Packages

```
packages/
├── database/
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   ├── migrations/              # Prisma migrations
│   └── seed.ts                  # Seed scripts
│
├── framework-engine/
│   ├── src/
│   │   ├── types.ts             # Framework types
│   │   ├── loader.ts            # Framework loader
│   │   ├── nist-csf-2.0.ts      # NIST CSF config
│   │   └── validator.ts         # Configuration validator
│
├── scoring-engine/
│   ├── src/
│   │   ├── types.ts             # Scoring types
│   │   ├── calculator.ts        # Maturity calculation
│   │   ├── aggregator.ts        # Score aggregation
│   │   └── gap-analyzer.ts      # Gap analysis
│
├── import-engine/
│   ├── src/
│   │   ├── parser.ts            # Excel/CSV parsing
│   │   ├── validator.ts         # Data validation
│   │   ├── mapper.ts            # Column mapping
│   │   └── security.ts          # Injection prevention
│
├── security/
│   ├── src/
│   │   ├── middleware/          # Auth & tenant isolation
│   │   ├── validation/          # Input validation
│   │   ├── sanitization/        # Output encoding
│   │   └── encryption/          # Crypto utilities
│
├── shared/
│   ├── src/
│   │   ├── types/               # Shared TypeScript types
│   │   ├── constants/           # Application constants
│   │   └── utils/               # Utility functions
│
└── ui/
    ├── src/
    │   ├── components/          # Reusable React components
    │   ├── hooks/               # Reusable React hooks
    │   └── styles/              # Shared styles
```

## Data Flow Architecture

### Assessment Creation Flow

```
User Input
    │
    ▼
Next.js Form Component
    │
    ▼
Client-side Validation (Zod)
    │
    ▼
API Request (POST /assessments)
    │
    ▼
NestJS Controller
    │
    ▼
Input Sanitization & Validation
    │
    ▼
Authorization Check (Tenant)
    │
    ▼
Assessment Service
    │
    ▼
Prisma ORM (Database)
    │
    ▼
PostgreSQL
    │
    ▼
Audit Log Entry
    │
    ▼
Response (API)
    │
    ▼
Next.js State Management
    │
    ▼
Dashboard Update
```

### Assessment Scoring Flow

```
Assessment Response
    │
    ▼
Scoring Service (NestJS)
    │
    ├─► Framework Engine (Load NIST CSF structure)
    │   
    ├─► Scoring Calculator
    │   ├─ Item maturity score
    │   ├─ Category aggregation
    │   ├─ Function aggregation
    │   └─ Organization score
    │
    ├─► Gap Analyzer
    │   ├─ Current vs Target
    │   ├─ Gap = Target - Current
    │   └─ Risk rating
    │
    ▼
Database Update
    │
    ▼
Dashboard Refresh (Redis cache invalidation)
    │
    ▼
Next.js Receives Updated Scores
    │
    ▼
Charts & Visualizations Render
```

### Excel Import Flow

```
User Uploads File
    │
    ▼
Next.js Upload Handler
    │
    ├─ MIME type validation
    ├─ File size validation
    └─ Virus scan (future)
    │
    ▼
API: POST /assessments/import
    │
    ▼
Import Engine
    │
    ├─ Parse XLSX/CSV
    ├─ Validate structure
    ├─ Sanitize against injection
    ├─ Column mapping
    ├─ Data validation
    └─ Error collection
    │
    ▼
Assessment Creation Loop
    │
    ▼
Scoring Engine (Calculate all scores)
    │
    ▼
Bulk Database Insert
    │
    ▼
Response: Valid/Invalid/Warning records
    │
    ▼
User sees import results & error report
```

## Authentication Architecture

```
User Credentials
    │
    ▼
NextAuth.js (NextAuth)
    │
    ├─ Email/Password authentication
    ├─ JWT token generation
    ├─ Session management
    └─ OIDC integration (future)
    │
    ▼
Token stored in HttpOnly cookie
    │
    ▼
API requests include token
    │
    ▼
NestJS JWT Strategy
    │
    ├─ Token verification
    ├─ User lookup
    ├─ Role assignment
    └─ Tenant context
    │
    ▼
Authorization middleware
    │
    ├─ Role-based access control
    ├─ Tenant isolation
    └─ Resource-level permissions
    │
    ▼
Request execution with user context
```

## Authorization Architecture

### Role Hierarchy

```
Tenant Admin
├── Read/Write all tenant data
├── User management
└── Configuration

CISO
├── Read all assessments
├── Create/Edit assessments
├── View all reports
└── Risk management

Security Architect
├── Create/Edit assessments
├── View framework definitions
├── Collaborate on design

GRC Manager
├── Create/Edit assessments
├── Manage risks & roadmap
└── Generate reports

Assessor
├── Create/Edit own assessments
└── View framework structure

Control Owner
├── View related controls
├── Provide evidence
└── Update control status

Remediation Owner
├── View remediation roadmap
├── Update initiative status
└── Track progress

Auditor
├── Read-only access
└── View audit logs

Executive Viewer
├── Executive dashboard only
└── High-level summaries

Read-Only Viewer
├── View-only access to all data
└── No modification rights
```

### Permission Matrix

| Resource | Admin | CISO | Architect | GRC | Assessor | Owner | Auditor | Viewer |
|----------|-------|------|-----------|-----|----------|-------|---------|--------|
| Assessment | CRUD | CRUD | CRU | CRUD | CRU* | R | R | R |
| Risk | CRUD | CRUD | CU | CRUD | R | CU | R | R |
| Roadmap | CRUD | CRU | CRU | CRUD | R | CU | R | R |
| Framework | CRUD | R | R | R | R | R | R | R |
| Reports | CRUD | R | R | R | R | R | R | R |
| Users | CRUD | R | R | R | R | R | R | - |
| Audit Log | R | R | R | R | R | R | R | - |

*Own records only

## Database Architecture

### Core Entities

```
Tenant
├── Organisation
│   ├── User (with roles)
│   ├── Assessment
│   │   ├── AssessmentItem (one per control)
│   │   ├── AssessmentResponse (score & evidence)
│   │   └── AssessmentHistory
│   ├── Risk
│   ├── Recommendation
│   └── RemediationInitiative

Framework
├── FrameworkVersion
├── Function
├── Category
├── Subcategory
└── AssessmentQuestion

MaturityModel
└── MaturityLevel (1-5 scale)

Evidence
├── File metadata
└── Reference to Assessment/Control

AuditEvent
├── Action (login, create, update, etc.)
├── Actor
├── Resource
└── Timestamp
```

### Entity Relationships

```
Tenant (1) ──── (N) Organisation
Organisation (1) ──── (N) User
Organisation (1) ──── (N) Assessment
Assessment (1) ──── (N) AssessmentItem
AssessmentItem (N) ──── (1) Framework
AssessmentItem (N) ──── (1) Category
AssessmentItem (N) ──── (1) Subcategory
Assessment (1) ──── (N) AssessmentResponse
Assessment (N) ──── (N) Evidence
Assessment (1) ──── (N) Risk
Risk (1) ──── (N) Recommendation
Recommendation (1) ──── (1) RemediationInitiative
RemediationInitiative (N) ──── (1) Organisation
```

## Scoring Engine Architecture

```
Assessment Response (Current Maturity = 3)
    │
    ▼
Item Score: 3
    │
    ▼
Category Aggregation
├─ Average all items in category
└─ Example: (3 + 2 + 4) / 3 = 3.0
    │
    ▼
Function Aggregation
├─ Average all categories in function
└─ Example: (3.0 + 2.5) / 2 = 2.75
    │
    ▼
Organisation Score
├─ Average all functions
└─ Example: (2.75 + 3.1 + 2.8 + ...) / 6 = 2.8
    │
    ▼
Gap Calculation
├─ Maturity Gap = Target - Current
├─ Example: 4.0 - 3.0 = 1.0
└─ Risk Rating (High = gap > 1.5)
    │
    ▼
Weighted Score (future)
├─ Item Score × Item Weight
├─ Category Score × Category Weight
└─ Organisation Score × Function Weight
```

## Deployment Architecture

```
Developer
    │
    ├─ Git Push
    │
    ▼
GitHub Actions (CI)
    │
    ├─ Run Tests
    ├─ Lint & Type Check
    ├─ SAST (CodeQL)
    ├─ Dependency Scan
    ├─ Secret Scan
    ├─ Build Docker Images
    └─ Container Scan (Trivy)
    │
    ├─ On Failure → Notify & Stop
    │
    ▼
GitHub Actions (DAST) - Staging
    │
    ├─ Deploy to Test Environment
    ├─ Run OWASP ZAP
    └─ Collect Results
    │
    ├─ Security Gate Check
    │
    ▼
GitHub Actions (Deploy) - Production
    │
    ├─ Approval Required
    ├─ Deploy to Production
    ├─ Run Smoke Tests
    └─ Monitor Logs
```

## Security Architecture

### Network Security

```
┌─────────────────────────────────────────┐
│         Internet / Public Network        │
└────────────┬────────────────────────────┘
             │
             ▼
     ┌───────────────────┐
     │  AWS ALB / WAF    │
     │ (Rate Limiting)   │
     └────────┬──────────┘
              │
              ▼
     ┌───────────────────┐
     │  VPC / Private    │
     │  Network          │
     └────────┬──────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
  API              Database
  Pod              Pod
(Encrypted)      (Encrypted)
```

### Data Security

- **Encryption in Transit**: TLS 1.3 for all API calls
- **Encryption at Rest**: AES-256 for sensitive database fields (future)
- **Secrets Management**: AWS Secrets Manager / HashiCorp Vault (production)
- **Password Hashing**: bcrypt for user passwords
- **Input Validation**: Server-side validation with Zod
- **Output Encoding**: Context-aware XSS prevention

### Access Control

- **Authentication**: JWT tokens with 1-hour expiration
- **Session Management**: Secure HttpOnly cookies
- **Tenant Isolation**: Enforced at API, DB query, and application layers
- **Authorization**: Role-based access control (RBAC)
- **Audit Logging**: All sensitive actions logged

## Scalability Considerations

### Horizontal Scaling

- **Stateless API**: NestJS instances can scale independently
- **Database Connection Pool**: Configurable Prisma pool
- **Redis**: Session store for distributed sessions (future)
- **CDN**: Static assets via CloudFront (future)

### Caching Strategy

- **Database Queries**: Prisma automatic caching
- **API Responses**: HTTP caching headers
- **Calculation Results**: Redis cache for scores (future)
- **Framework Data**: In-memory cache with TTL

### Performance Optimization

- **Server-Side Rendering**: Next.js for SEO & performance
- **API Data Fetching**: Minimize waterfalls
- **Query Optimization**: Indexed database queries
- **Lazy Loading**: Code splitting in Next.js
- **Image Optimization**: Next.js Image component

## Monitoring & Observability

### Application Metrics

- Request latency (p50, p95, p99)
- Error rates by endpoint
- Assessment scoring time
- Import processing time
- Database query performance

### Audit Metrics

- Login attempts & failures
- Assessment modifications
- Risk updates
- Score changes
- User role changes

### Infrastructure Metrics

- Pod CPU & memory usage
- Database connection count
- Redis memory usage
- Network I/O
- Error rates

### Alerting

- Error rate > 5%
- P95 latency > 2s
- Database connection pool exhaustion
- Security event detection
- Failed dependency scans
