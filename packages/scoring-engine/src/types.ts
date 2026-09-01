import { MaturityLevel, RiskLevel } from '@cmmp/shared';

/**
 * One assessed response, positioned in the framework hierarchy it belongs
 * to. Deliberately framework- and persistence-agnostic (plain IDs, no
 * Prisma types) so this package can be unit tested standalone and reused
 * regardless of how the caller loaded the data — mirrors the approach
 * `@cmmp/framework-engine`'s loader takes.
 */
export interface ScoredResponse {
  subcategoryId: string;
  categoryId: string;
  functionId: string;
  currentMaturity: MaturityLevel;
  targetMaturity: MaturityLevel;
  /** Relative importance within its parent; defaults to 1.0 if omitted by the caller. */
  weight?: number;
}

/**
 * A weighted-average maturity score. `null` fields mean "nothing scorable
 * here" (every contributing response was NOT_APPLICABLE, or there were no
 * responses at all) rather than a score of zero.
 */
export interface MaturityScore {
  currentScore: number | null;
  targetScore: number | null;
  gap: number | null;
  currentLevel: MaturityLevel | null;
  targetLevel: MaturityLevel | null;
  /** Total responses considered at or beneath this node. */
  responseCount: number;
  /** Responses that were NOT_APPLICABLE for currentMaturity are excluded from scoring but still counted here. */
  applicableCount: number;
}

export interface SubcategoryScore extends MaturityScore {
  subcategoryId: string;
}

export interface CategoryScore extends MaturityScore {
  categoryId: string;
  subcategories: SubcategoryScore[];
}

export interface FunctionScore extends MaturityScore {
  functionId: string;
  categories: CategoryScore[];
}

export interface OrganisationMaturityScore extends MaturityScore {
  functions: FunctionScore[];
}

export interface GapAnalysisEntry {
  level: 'function' | 'category' | 'subcategory';
  id: string;
  currentScore: number | null;
  targetScore: number | null;
  gap: number | null;
  riskLevel: RiskLevel;
}
