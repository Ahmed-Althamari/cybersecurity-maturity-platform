import { render, screen } from '@testing-library/react';

import { riskLevelColor } from '../../lib/maturity-scale';

import { RiskLevelBadge } from './RiskLevelBadge';

describe('RiskLevelBadge', () => {
  it('always prints the risk level as text, never relying on color alone', () => {
    render(<RiskLevelBadge riskLevel="CRITICAL" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });

  it('colors the badge using the shared riskLevelColor mapping', () => {
    render(<RiskLevelBadge riskLevel="HIGH" />);
    expect(screen.getByText('HIGH')).toHaveStyle({ color: riskLevelColor('HIGH') });
  });
});
