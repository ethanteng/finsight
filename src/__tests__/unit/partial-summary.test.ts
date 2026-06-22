import { describe, expect, it } from '@jest/globals';
import { extractPartialSummary } from '../../openai/structured-response';

describe('extractPartialSummary (streaming answer extraction)', () => {
  it('returns empty before the summary field appears', () => {
    expect(extractPartialSummary('')).toBe('');
    expect(extractPartialSummary('{')).toBe('');
    expect(extractPartialSummary('{"key_numbers": {')).toBe('');
    expect(extractPartialSummary('{"summary"')).toBe('');
    expect(extractPartialSummary('{"summary":')).toBe('');
  });

  it('extracts an in-progress (unterminated) summary string', () => {
    expect(extractPartialSummary('{"summary": "You are on')).toBe('You are on');
    expect(extractPartialSummary('{"summary":"Hello')).toBe('Hello');
  });

  it('extracts a completed summary and stops at the closing quote', () => {
    expect(extractPartialSummary('{"summary": "All set.", "key_numbers": {}}')).toBe('All set.');
  });

  it('grows monotonically as more text streams in (delta-friendly)', () => {
    const chunks = ['{"summary": "', 'Net ', 'worth ', 'is ', 'negative', '."}'];
    let raw = '';
    const seen: string[] = [];
    for (const c of chunks) {
      raw += c;
      seen.push(extractPartialSummary(raw));
    }
    // each successive value is a prefix-extension of the previous
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].startsWith(seen[i - 1])).toBe(true);
    }
    expect(seen[seen.length - 1]).toBe('Net worth is negative.');
  });

  it('decodes JSON escapes', () => {
    expect(extractPartialSummary('{"summary": "line1\\nline2"}')).toBe('line1\nline2');
    expect(extractPartialSummary('{"summary": "a \\"quote\\" here"}')).toBe('a "quote" here');
    expect(extractPartialSummary('{"summary": "tab\\tend"}')).toBe('tab\tend');
  });

  it('does not emit a partial trailing escape', () => {
    // backslash with no following char yet — should stop before it
    expect(extractPartialSummary('{"summary": "done\\')).toBe('done');
  });

  it('works when the JSON is inside a markdown code fence', () => {
    expect(extractPartialSummary('```json\n{"summary": "Fenced answer')).toBe('Fenced answer');
  });
});
