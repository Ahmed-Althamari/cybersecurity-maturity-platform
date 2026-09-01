import { render, screen } from '@testing-library/react';

import { Badge, RiskLevelBadge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>HIGH</Badge>);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('applies the default variant classes when none is given', () => {
    render(<Badge>LOGIN</Badge>);
    expect(screen.getByText('LOGIN')).toHaveClass('bg-slate-700');
  });

  it('applies the requested variant classes', () => {
    render(<Badge variant="critical">CRITICAL</Badge>);
    expect(screen.getByText('CRITICAL')).toHaveClass('bg-red-950');
  });
});

describe('RiskLevelBadge', () => {
  it.each([
    ['CRITICAL', 'bg-red-950'],
    ['HIGH', 'bg-orange-950'],
    ['MEDIUM', 'bg-yellow-950'],
    ['LOW', 'bg-blue-950'],
    ['MINIMAL', 'bg-emerald-950'],
  ])('maps risk level %s to its color variant', (level, expectedClass) => {
    render(<RiskLevelBadge level={level} />);
    expect(screen.getByText(level)).toHaveClass(expectedClass);
  });

  it('falls back to the default variant for an unrecognized level', () => {
    render(<RiskLevelBadge level="UNKNOWN" />);
    expect(screen.getByText('UNKNOWN')).toHaveClass('bg-slate-700');
  });
});
