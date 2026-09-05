import { render, screen } from '@testing-library/react';

import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders the title and value', () => {
    render(<KpiCard title="Overall Maturity" value="2.5" />);
    expect(screen.getByText('Overall Maturity')).toBeInTheDocument();
    expect(screen.getByText('2.5')).toBeInTheDocument();
  });

  it('renders the optional subtitle only when given', () => {
    const { rerender } = render(<KpiCard title="Gap" value="1.4" />);
    expect(screen.queryByText('per assessment')).not.toBeInTheDocument();

    rerender(<KpiCard title="Gap" value="1.4" subtitle="per assessment" />);
    expect(screen.getByText('per assessment')).toBeInTheDocument();
  });

  it('colors the value with accentColor when given, white otherwise', () => {
    const { rerender } = render(<KpiCard title="Critical Gaps" value="14" />);
    expect(screen.getByText('14')).toHaveStyle({ color: '#ffffff' });

    rerender(<KpiCard title="Critical Gaps" value="14" accentColor="#e66767" />);
    expect(screen.getByText('14')).toHaveStyle({ color: '#e66767' });
  });
});
