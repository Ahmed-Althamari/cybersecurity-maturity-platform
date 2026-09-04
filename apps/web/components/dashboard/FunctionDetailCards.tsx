import React from 'react';

import type { FunctionMaturity } from '../../lib/api';
import { maturityBand } from '../../lib/maturity-scale';

const FUNCTION_NAMES: Record<string, string> = {
  GV: 'Govern',
  ID: 'Identify',
  PR: 'Protect',
  DE: 'Detect',
  RS: 'Respond',
  RC: 'Recover',
};

interface FunctionDetailCardsProps {
  functions: FunctionMaturity[];
}

export function FunctionDetailCards({ functions }: FunctionDetailCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {functions.map((fn) => {
        const band = maturityBand(fn.currentMaturity);
        return (
          <div key={fn.code} className="bg-slate-800 rounded-lg p-5 border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white font-semibold">{FUNCTION_NAMES[fn.code] ?? fn.name}</p>
                <p className="text-slate-500 text-xs">{fn.code}</p>
              </div>
              <span
                className="text-xs font-medium px-2 py-1 rounded-full"
                style={{ color: band.color, backgroundColor: `${band.color}22` }}
              >
                {band.label}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-slate-400 text-xs">Current</p>
                <p className="text-white font-bold text-lg">{fn.currentMaturity.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Target</p>
                <p className="text-white font-bold text-lg">{fn.targetMaturity.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Gap</p>
                <p className="text-white font-bold text-lg">{fn.gap.toFixed(1)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>{fn.completionPercentage}% complete</span>
              {fn.highRiskGaps > 0 && <span className="text-orange-400">{fn.highRiskGaps} high-risk gap{fn.highRiskGaps === 1 ? '' : 's'}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
