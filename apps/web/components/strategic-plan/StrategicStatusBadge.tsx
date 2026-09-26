import React from 'react';

import { strategicStatusColor, strategicStatusLabel } from '../../lib/strategic-plan';

/** Color never carries the label alone — mirrors RiskLevelBadge's own convention. */
export function StrategicStatusBadge({ status }: { status: string }) {
  const color = strategicStatusColor(status);
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-full border whitespace-nowrap" style={{ color, borderColor: color }}>
      {strategicStatusLabel(status)}
    </span>
  );
}
