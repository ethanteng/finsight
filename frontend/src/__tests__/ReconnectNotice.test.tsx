import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ReconnectNotice from '@/components/ReconnectNotice';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('ReconnectNotice', () => {
  beforeEach(() => push.mockClear());

  it('renders nothing when no connection needs attention', () => {
    const { container } = render(
      <ReconnectNotice connectionHealth={{ reauthRequiredCount: 0, reauthRequiredInstitutions: [] }} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the server predates the field', () => {
    // Mid-deploy the payload has no connectionHealth at all; that must read as
    // "nothing to flag" rather than throwing on the financial surfaces.
    const { container } = render(<ReconnectNotice connectionHealth={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names a single institution', () => {
    render(
      <ReconnectNotice
        connectionHealth={{ reauthRequiredCount: 1, reauthRequiredInstitutions: ['Bank of America'] }}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('Bank of America needs to be reconnected');
  });

  it('names two institutions', () => {
    render(
      <ReconnectNotice
        connectionHealth={{
          reauthRequiredCount: 2,
          reauthRequiredInstitutions: ['Bank of America', 'American Express'],
        }}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'Bank of America and American Express need to be reconnected'
    );
  });

  it('summarizes rather than listing every institution', () => {
    render(
      <ReconnectNotice
        connectionHealth={{
          reauthRequiredCount: 4,
          reauthRequiredInstitutions: ['Bank of America', 'American Express', 'Chase', 'Citi'],
        }}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent(
      'Bank of America and 3 others need to be reconnected'
    );
  });

  it('still reports a count when no institution name is known', () => {
    render(<ReconnectNotice connectionHealth={{ reauthRequiredCount: 2, reauthRequiredInstitutions: [] }} />);
    expect(screen.getByRole('button')).toHaveTextContent('2 accounts need to be reconnected');
  });

  it('navigates to Accounts & context without triggering the card underneath', () => {
    const parentClick = jest.fn();
    render(
      <div onClick={parentClick}>
        <ReconnectNotice
          connectionHealth={{ reauthRequiredCount: 1, reauthRequiredInstitutions: ['Chase'] }}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('button'));

    expect(push).toHaveBeenCalledWith('/profile');
    // Both surfaces wrap this in a card that navigates elsewhere on click.
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('renders the compact chip variant with the same message and target', () => {
    render(
      <ReconnectNotice
        connectionHealth={{ reauthRequiredCount: 1, reauthRequiredInstitutions: ['Chase'] }}
        variant="chip"
      />
    );

    const chip = screen.getByRole('button');
    expect(chip).toHaveTextContent('Chase needs to be reconnected');
    fireEvent.click(chip);
    expect(push).toHaveBeenCalledWith('/profile');
  });
});
