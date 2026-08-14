import { render, screen } from '@testing-library/react';
import { ShowTheMathContent } from '@/components/ShowTheMathModal';

describe('ShowTheMathContent', () => {
  it('explains when a legacy payload has no evidence manifest', () => {
    render(<ShowTheMathContent data={{}} />);

    expect(screen.getByText(/created before traceable evidence manifests were available/i)).toBeInTheDocument();
  });
});
