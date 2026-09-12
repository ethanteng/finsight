/**
 * Typing a number into a text box.
 *
 * Money boxes on the calculators are text inputs rather than `type="number"`,
 * because a number input cannot show grouped digits: `1500000` stays an
 * unreadable run of zeros exactly where a visitor most needs to check they
 * typed the figure they meant. These helpers group as they type instead.
 *
 * Shared by both calculators so the two cannot drift on what counts as a
 * number.
 */

/**
 * Strip everything that is not a digit, a decimal point, or a leading minus.
 *
 * The point used to be deleted as it was typed, so `1.2` became `12` and
 * `62.5` became `625`. A visitor meaning 1.2 million got a confident answer
 * about twelve dollars, which is worse than any rejection: nothing on the
 * page disagreed with them.
 *
 * The minus used to go the same way, which was worse still: `-5000` became
 * `5,000` and the calculator's own "cannot be negative" could never fire, so
 * a typed or pasted negative was silently turned into its opposite and
 * answered confidently. Both are kept now, and the figure is refused by name
 * rather than quietly rewritten.
 */
export function numericInput(value: string): string {
  const negative = value.trimStart().startsWith('-');
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...fraction] = cleaned.split('.');
  const digits = fraction.length === 0 ? whole : `${whole}.${fraction.join('')}`;
  return negative ? `-${digits}` : digits;
}

/** Groups the whole part while a decimal is being typed, so "1200.5" stays "1,200.5". */
export function withCommas(value: string): string {
  const cleaned = numericInput(value);
  // A lone "-" or "." is mid-typing, not a number: `Number("-")` is NaN, and
  // grouping that would put the literal text "NaN" in the box.
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return cleaned;

  const negative = cleaned.startsWith('-');
  const [whole, fraction] = (negative ? cleaned.slice(1) : cleaned).split('.');
  const grouped = whole === '' ? '' : Number(whole).toLocaleString('en-US');
  const body = fraction === undefined ? grouped : `${grouped}.${fraction}`;
  return negative ? `-${body}` : body;
}

/**
 * Read a grouped figure back as a number.
 *
 * Returns NaN for a box holding nothing usable, which every caller has to
 * handle — the calculators refuse such a figure by name rather than treating
 * it as a zero the visitor never typed.
 */
export function fromGrouped(value: string): number {
  const cleaned = numericInput(value);
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return Number.NaN;
  return Number(cleaned);
}
