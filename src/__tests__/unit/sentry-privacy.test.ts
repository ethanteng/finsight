import type { Event } from '@sentry/node';
import {
  sanitizeSentryText,
  scrubSentryBreadcrumb,
  scrubSentryEvent,
} from '../../observability/sentry-privacy';

describe('Sentry privacy filters', () => {
  it('redacts common identifiers and secrets from text', () => {
    const value = sanitizeSentryText(
      'user@example.com from 192.168.1.10 called https://asklinc.com/ask?token=secret with Bearer abc.def',
    );

    expect(value).not.toContain('user@example.com');
    expect(value).not.toContain('192.168.1.10');
    expect(value).not.toContain('token=secret');
    expect(value).not.toContain('abc.def');
    expect(value).toContain('[Filtered');
  });

  it('removes user and request payload data before sending an event', () => {
    const event: Event = {
      message: 'Failure for customer@example.com',
      user: { id: 'customer-123', email: 'customer@example.com' },
      request: {
        method: 'POST',
        url: 'https://asklinc.com/ask?question=private',
        headers: { authorization: 'Bearer private-token' },
        data: { question: 'What is my account balance?' },
      },
      extra: {
        access_token: 'private-token',
        nested: { email: 'customer@example.com' },
      },
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toEqual({ method: 'POST' });
    expect(scrubbed.message).not.toContain('customer@example.com');
    expect(scrubbed.extra).toEqual({
      access_token: '[Filtered]',
      nested: { email: '[Filtered]' },
    });
  });

  it('drops console breadcrumbs', () => {
    expect(scrubSentryBreadcrumb({ category: 'console', message: 'private data' })).toBeNull();
  });
});
