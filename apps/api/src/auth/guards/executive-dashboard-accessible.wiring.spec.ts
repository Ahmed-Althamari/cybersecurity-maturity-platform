import { AssessmentsController } from '../../assessments/assessments.controller';
import { DashboardController } from '../../dashboard/dashboard.controller';
import { AuthController } from '../auth.controller';
import { EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY } from '../decorators/executive-dashboard-accessible.decorator';

// Regression test for the exact allowlist ExecutiveViewerScopeGuard enforces.
// A future refactor that quietly drops @ExecutiveDashboardAccessible() from
// one of these handlers would lock EXECUTIVE_VIEWER out of a route it needs
// (session lifecycle, picking an assessment); adding it to a handler NOT
// listed here would widen EXECUTIVE_VIEWER's access beyond the documented
// "dashboard only" scope (docs/architecture.md) with nothing else catching it.
describe('@ExecutiveDashboardAccessible() wiring', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function isAccessible(handler: (...args: any[]) => any): boolean {
    return Reflect.getMetadata(EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY, handler) === true;
  }

  it('marks every DashboardController handler accessible -- the whole controller IS the executive dashboard', () => {
    expect(isAccessible(DashboardController.prototype.getExecutiveDashboard)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getMaturityOverview)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getFunctionMaturity)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getGapAnalysis)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getMaturityHeatmap)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getRiskSummary)).toBe(true);
    expect(isAccessible(DashboardController.prototype.getRoadmapStatus)).toBe(true);
  });

  it('marks AssessmentsController.findAll accessible (needed to pick an assessment) but NOT findOne (raw item-level data)', () => {
    expect(isAccessible(AssessmentsController.prototype.findAll)).toBe(true);
    expect(isAccessible(AssessmentsController.prototype.findOne)).toBe(false);
    expect(isAccessible(AssessmentsController.prototype.getHistory)).toBe(false);
    expect(isAccessible(AssessmentsController.prototype.getScores)).toBe(false);
  });

  it('marks session-lifecycle AuthController handlers accessible, but not login (no user yet, unaffected either way)', () => {
    expect(isAccessible(AuthController.prototype.logout)).toBe(true);
    expect(isAccessible(AuthController.prototype.refresh)).toBe(true);
    expect(isAccessible(AuthController.prototype.getCurrentUser)).toBe(true);
    expect(isAccessible(AuthController.prototype.login)).toBe(false);
  });
});
