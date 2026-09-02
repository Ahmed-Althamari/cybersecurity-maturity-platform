import { SetMetadata } from '@nestjs/common';

export const EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY = 'executiveDashboardAccessible';

// Marks a handler as part of the "executive dashboard" surface --
// see ExecutiveViewerScopeGuard for what that restricts.
export const ExecutiveDashboardAccessible = () => SetMetadata(EXECUTIVE_DASHBOARD_ACCESSIBLE_KEY, true);
