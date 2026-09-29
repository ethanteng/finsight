import { render, screen } from '@testing-library/react';
import LincAvatar from '@/components/LincAvatar';
import { CalculatorAnswer } from '@/components/marketing/CalculatorStory';

describe('LincAvatar', () => {
  it('stays out of the accessibility tree unless it is given a name', () => {
    const { container, rerender } = render(<LincAvatar />);
    expect(container.querySelector('.linc-avatar')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    rerender(<LincAvatar label="Linc" />);
    expect(screen.getByRole('img', { name: 'Linc' })).toBeInTheDocument();
  });

  it('only draws the waving arm when asked to wave', () => {
    const { container, rerender } = render(<LincAvatar />);
    expect(container.querySelector('.linc-avatar-wave')).not.toBeInTheDocument();

    rerender(<LincAvatar wave />);
    expect(container.querySelector('.linc-avatar-wave')).toBeInTheDocument();
  });
});

describe('Linc in the calculator conversation', () => {
  const interpretation = { headline: 'Your plan held up.', paragraphs: ['It lasted in most histories.'], watchOuts: [] };

  it('thinks while the reading loads and settles once it arrives', () => {
    const { container, rerender } = render(<CalculatorAnswer question="Will it last?" interpretation={null} isLoading />);
    const working = container.querySelector('.calculator-chat-linc .linc-avatar');
    expect(working).toHaveAttribute('data-mood', 'skeptical');
    expect(working).toHaveClass('is-thinking');

    rerender(<CalculatorAnswer question="Will it last?" interpretation={interpretation} isLoading={false} />);
    const answered = container.querySelector('.calculator-chat-linc .linc-avatar');
    expect(answered).toHaveAttribute('data-mood', 'deadpan');
    expect(answered).not.toHaveClass('is-thinking');
    expect(screen.getByText('Your plan held up.')).toBeInTheDocument();
  });
});
