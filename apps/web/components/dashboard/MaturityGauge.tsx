import React from 'react';

import { maturityBand, SERIES_COLORS } from '../../lib/maturity-scale';

interface MaturityGaugeProps {
  current: number;
  target: number;
}

const MAX_SCORE = 5;
const SIZE = 210;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTER = SIZE / 2;

/**
 * Hero figure for the dashboard: a radial progress ring showing overall
 * maturity out of 5, colored by status band, with a thin tick marking where
 * the target sits on the same ring — current is the fill (the reading),
 * target is a marker (the goal), never colored alike so the two don't blur.
 */
export function MaturityGauge({ current, target }: MaturityGaugeProps) {
  const band = maturityBand(current);
  const currentFraction = Math.max(0, Math.min(1, current / MAX_SCORE));
  const targetFraction = Math.max(0, Math.min(1, target / MAX_SCORE));
  const dashOffset = CIRCUMFERENCE * (1 - currentFraction);

  const targetAngleRad = ((targetFraction * 360 - 90) * Math.PI) / 180;
  const tickInner = RADIUS - STROKE / 2 - 4;
  const tickOuter = RADIUS + STROKE / 2 + 4;
  const tickX1 = CENTER + tickInner * Math.cos(targetAngleRad);
  const tickY1 = CENTER + tickInner * Math.sin(targetAngleRad);
  const tickX2 = CENTER + tickOuter * Math.cos(targetAngleRad);
  const tickY2 = CENTER + tickOuter * Math.sin(targetAngleRad);

  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 h-full flex flex-col items-center">
      <h3 className="text-white font-semibold mb-2 self-start">Overall Maturity</h3>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Overall maturity ${current.toFixed(1)} out of 5, target ${target.toFixed(1)}`}>
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="#383835" strokeWidth={STROKE} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={band.color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
        <line x1={tickX1} y1={tickY1} x2={tickX2} y2={tickY2} stroke={SERIES_COLORS.target} strokeWidth={3} strokeLinecap="round" />
        <text x={CENTER} y={CENTER - 4} textAnchor="middle" fill="#ffffff" style={{ fontSize: 44, fontWeight: 700 }}>
          {current.toFixed(1)}
        </text>
        <text x={CENTER} y={CENTER + 22} textAnchor="middle" fill="#898781" style={{ fontSize: 13 }}>
          out of {MAX_SCORE.toFixed(1)}
        </text>
      </svg>
      <div className="flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: band.color }} />
          Current · {band.label}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-0.5 inline-block" style={{ backgroundColor: SERIES_COLORS.target }} />
          Target {target.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
