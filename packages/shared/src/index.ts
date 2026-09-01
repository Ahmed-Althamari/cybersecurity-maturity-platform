// Shared types used across the CMMP application
import { z } from "zod";

// ============================================================================
// ENUMS
// ============================================================================

export enum MaturityLevel {
  NOT_APPLICABLE = "NOT_APPLICABLE",
  INITIAL = "INITIAL",
  DEVELOPING = "DEVELOPING",
  DEFINED = "DEFINED",
  MANAGED = "MANAGED",
  OPTIMISED = "OPTIMISED",
}

export enum RiskLevel {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  MINIMAL = "MINIMAL",
}

export enum ControlStatus {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  BLOCKED = "BLOCKED",
}

export enum UserRole {
  PLATFORM_ADMIN = "PLATFORM_ADMIN",
  ORGANISATION_ADMIN = "ORGANISATION_ADMIN",
  CISO = "CISO",
  SECURITY_ARCHITECT = "SECURITY_ARCHITECT",
  GRC_MANAGER = "GRC_MANAGER",
  ASSESSOR = "ASSESSOR",
  CONTROL_OWNER = "CONTROL_OWNER",
  REMEDIATION_OWNER = "REMEDIATION_OWNER",
  AUDITOR = "AUDITOR",
  EXECUTIVE_VIEWER = "EXECUTIVE_VIEWER",
  READ_ONLY_VIEWER = "READ_ONLY_VIEWER",
}

// ============================================================================
// ZOD SCHEMAS FOR VALIDATION
// ============================================================================

export const MaturityLevelSchema = z.enum([
  "NOT_APPLICABLE",
  "INITIAL",
  "DEVELOPING",
  "DEFINED",
  "MANAGED",
  "OPTIMISED",
]);

export const RiskLevelSchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "MINIMAL",
]);

export const ControlStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "BLOCKED",
]);

// ============================================================================
// ASSESSMENT TYPES
// ============================================================================

export interface Assessment {
  id: string;
  tenantId: string;
  organisationId: string;
  name: string;
  description?: string;
  status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "APPROVED" | "ARCHIVED";
  assessmentDate: Date;
  completionPercentage: number;
  currentMaturity?: number;
  targetMaturity?: number;
  maturityGap?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssessmentItem {
  id: string;
  assessmentId: string;
  questionId: string;
  currentMaturity: MaturityLevel;
  targetMaturity: MaturityLevel;
  weight: number;
  riskLevel: RiskLevel;
  businessCriticality: number;
  controlStatus: ControlStatus;
  rationale?: string;
  evidence?: string;
  ownerName?: string;
  remediationDueDate?: Date;
}

export interface AssessmentResponse {
  items: AssessmentItem[];
  assessment: Assessment;
  totalItems: number;
  completedItems: number;
  maturityScore: number;
}

// ============================================================================
// FRAMEWORK TYPES
// ============================================================================

export interface Framework {
  id: string;
  name: string;
  slug: string;
  version: string;
  frameWorkType: string;
  description?: string;
  isActive: boolean;
}

export interface Function {
  id: string;
  frameworkId: string;
  code: string;
  name: string;
  description?: string;
}

export interface Category {
  id: string;
  functionId: string;
  code: string;
  name: string;
  description?: string;
}

export interface Subcategory {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  description?: string;
}

export interface AssessmentQuestion {
  id: string;
  subcategoryId: string;
  question: string;
  guidance?: string;
  examples?: string[];
}

// ============================================================================
// DASHBOARD TYPES
// ============================================================================

export interface MaturityOverview {
  overallMaturity: number;
  targetMaturity: number;
  maturityGap: number;
  completionPercentage: number;
  criticalGaps: number;
  highRiskFindings: number;
  openRemediationActions: number;
}

export interface FunctionMaturity {
  code: string;
  name: string;
  currentMaturity: number;
  targetMaturity: number;
  gap: number;
  completionPercentage: number;
  highRiskGaps: number;
  trend?: number; // Percentage change from previous
}

export interface GapAnalysis {
  functionCode: string;
  functionName: string;
  currentMaturity: number;
  targetMaturity: number;
  gap: number;
  riskLevel: RiskLevel;
  affectedControls: number;
}

// ============================================================================
// RISK TYPES
// ============================================================================

export interface Risk {
  id: string;
  title: string;
  description?: string;
  threat?: string;
  likelihood: number;
  impact: number;
  riskLevel: RiskLevel;
  owner?: string;
  status: string;
  targetDate?: Date;
}

// ============================================================================
// REMEDIATION ROADMAP TYPES
// ============================================================================

export interface RemediationInitiative {
  id: string;
  title: string;
  description?: string;
  priority: number;
  complexity: number;
  currentMaturity: MaturityLevel;
  targetMaturity: MaturityLevel;
  startDate?: Date;
  targetCompletionDate?: Date;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "BLOCKED" | "ON_HOLD";
  owner?: string;
  estimatedCost?: number;
}

// ============================================================================
// DASHBOARD SUMMARY TYPES (Phase 9)
// ============================================================================

export interface RiskSummary {
  totalRisks: number;
  byRiskLevel: Record<RiskLevel, number>;
  byStatus: Record<string, number>;
  /** Highest-severity risks first, capped to a display-friendly count. */
  topRisks: Risk[];
}

export interface RoadmapStatus {
  totalInitiatives: number;
  byStatus: Record<RemediationInitiative["status"], number>;
  /** Not-yet-completed initiatives with the nearest targetCompletionDate first. */
  upcoming: RemediationInitiative[];
}

export interface ExecutiveDashboard {
  maturityOverview: MaturityOverview;
  functionMaturity: FunctionMaturity[];
  topGaps: GapAnalysis[];
  riskSummary: RiskSummary;
  roadmapStatus: RoadmapStatus;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// USER & AUTH TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  roles: UserRole[];
  isActive: boolean;
  lastLogin?: Date;
}

export interface AuthSession {
  user?: User;
  expires?: string;
  accessToken?: string;
}

// ============================================================================
// PAGINATION SCHEMA
// ============================================================================

export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;
