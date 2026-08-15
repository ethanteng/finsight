import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useDialog } from '@/components/ui/dialog';

function Harness({ onResult }: { onResult?: (confirmed: boolean) => void }) {
  const { showError, showConfirm, dialog } = useDialog();

  return (
    <div>
      <button onClick={() => void showError('Network error. Please try again.')}>Trigger error</button>
      <button
        onClick={async () => {
          const confirmed = await showConfirm({
            title: 'Delete this account?',
            message: 'Bread HYSA will be removed from your profile.',
            confirmLabel: 'Delete account',
          });
          onResult?.(confirmed);
        }}
      >
        Trigger confirm
      </button>
      {dialog}
    </div>
  );
}

describe('useDialog', () => {
  it('shows an error message in a modal instead of a native alert', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Trigger error' }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName('Something went wrong');
    expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves true when the confirm action is taken', async () => {
    const user = userEvent.setup();
    const onResult = jest.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole('button', { name: 'Trigger confirm' }));
    expect(screen.getByText('Bread HYSA will be removed from your profile.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete account' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('resolves false when cancelled', async () => {
    const user = userEvent.setup();
    const onResult = jest.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole('button', { name: 'Trigger confirm' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('resolves false when dismissed with Escape', async () => {
    const user = userEvent.setup();
    const onResult = jest.fn();
    render(<Harness onResult={onResult} />);

    await user.click(screen.getByRole('button', { name: 'Trigger confirm' }));
    await user.keyboard('{Escape}');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('restores page scrolling once the dialog closes', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Trigger error' }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(document.body.style.overflow).toBe('');
  });
});
