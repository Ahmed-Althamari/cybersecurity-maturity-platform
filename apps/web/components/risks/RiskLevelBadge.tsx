import React from 'react';

import { riskLevelColor } from '../../lib/maturity-scale';

/** Color never carries the label alone — the risk level's own text is always printed alongside it. */
export function RiskLevelBadge({ riskLevel }: { riskLevel: string }) {
  return (
    <span
      className="text-xs font-medium px-2 py-1 rounded-full border"
      style={{ color: riskLevelColor(riskLevel), borderColor: riskLevelColor(riskLevel) }}
    >
      {riskLevel}
    </span>
  );
}
