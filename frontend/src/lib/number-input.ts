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
 * Strip everything that is not a digit or a decimal point, keeping the first
 * point only.
 *
 * The point used to be deleted as it was typed, so `1.2` became `12` and
 * `62.5` became `625`. A visitor meaning 1.2 million got a confident answer
 * about twelve dollars, which is worse than any rejection: nothing on the
 * page disagreed with them. Keeping the point lets the model say it cannot
 * use the figure.
 */
export function numericInput(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const [whole, ...fraction] = cleaned.split('.');
  return fraction.length === 0 ? whole : `${whole}.${fraction.join('')}`;
}

/** Groups the whole part while a decimal is being typed, so "1200.5" stays "1,200.5". */
export function withCommas(value: string): string {
  const cleaned = numericInput(value);
  if (cleaned === '') return '';
  const [whole, fraction] = cleaned.split('.');
  const grouped = whole === '' ? '' : Number(whole).toLocaleString('en-US');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
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
  return cleaned === '' ? Number.NaN : Number(cleaned);
}
