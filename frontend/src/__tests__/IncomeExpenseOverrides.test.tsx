import React from 'react';
import { render, screen } from '@testing-library/react';
import IncomeExpenseOverrides from '@/components/finances/IncomeExpenseOverrides';

describe('IncomeExpenseOverrides', () => {
  it('shows N/A, not a calculated figure, when there is no history to average', () => {
    render(
      <IncomeExpenseOverrides
        calculatedIncome={null}
        calculatedExpense={null}
        initialMonthlyIncome={null}
        initialMonthlyExpense={null}
      />
    );

    expect(screen.getAllByText('N/A')).toHaveLength(2);
    expect(screen.queryByText('Calculated from transactions')).not.toBeInTheDocument();
  });

  it('labels an average that was calculated from transactions', () => {
    render(
      <IncomeExpenseOverrides
        calculatedIncome={5200}
        calculatedExpense={3100}
        initialMonthlyIncome={null}
        initialMonthlyExpense={null}
      />
    );

    expect(screen.getAllByText('Calculated from transactions')).toHaveLength(2);
  });
});
