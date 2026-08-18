import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import UserProfile from '../components/UserProfile';

describe('What Linc remembers about you', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: { getItem: jest.fn(() => 'token') },
      configurable: true,
    });
  });

  it('renders bounded memory and saves structured fields', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ memory: { age: 42, occupation: 'Teacher' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ hasHome: false }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ memory: { preferredName: 'Sam', age: 42, occupation: 'Teacher' } }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<UserProfile userId="user-1" />);
    expect(await screen.findByText('What Linc remembers about you')).toBeInTheDocument();
    expect(await screen.findByText('Teacher')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByLabelText('Preferred name'), { target: { value: 'Sam' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const saveRequest = fetchMock.mock.calls[2];
    expect(saveRequest[0]).toContain('/profile');
    expect(JSON.parse(saveRequest[1].body)).toEqual({
      memory: { preferredName: 'Sam', age: 42, occupation: 'Teacher' },
    });
  });
});
