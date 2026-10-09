/**
 * The form an answer carries when a calculator is waiting on figures only the
 * user has (see `src/openai/input-request.ts` on the server).
 *
 * Submitting it does not send numbers down a separate path. Each filled field
 * becomes its server-written sentence, the sentences are sent as the user's
 * next message in the decision, and the planner reads them like anything else
 * the user types. So everything here is about reading what was typed and
 * writing it back out in exactly the words the server asked for.
 */

export type InputRequestFieldKind = 'age' | 'usd' | 'usd_per_year' | 'percent' | 'choice';

export interface DisplayInputRequestField {
  id: string;
  label: string;
  kind: InputRequestFieldKind;
  required: boolean;
  minimum?: number;
  maximum?: number;
  options?: Array<{ value: string; label: string }>;
  value?: number | string;
  valueNote?: string;
  defaultNote?: string;
  sentence: string;
}

export interface DisplayInputRequest {
  calculatorId: string;
  title: string;
  question: string;
  submitLabel: string;
  fields: DisplayInputRequestField[];
}

export type FieldReading =
  | { status: 'empty' }
  | { status: 'ok'; value: number | string }
  | { status: 'invalid'; message: string };

function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

/** The text a field opens with: what Linc already holds for it, as someone would type it. */
export function initialFieldText(field: DisplayInputRequestField): string {
  const value = field.value;
  if (value === undefined) return '';
  if (field.kind === 'choice') return String(value);
  if (typeof value !== 'number') return '';
  if (field.kind === 'usd' || field.kind === 'usd_per_year') return Math.round(value).toLocaleString('en-US');
  return String(value);
}

function rangeMessage(field: DisplayInputRequestField): string {
  const { minimum, maximum } = field;
  const show = (value: number) =>
    field.kind === 'usd' || field.kind === 'usd_per_year' ? dollars(value)
      : field.kind === 'percent' ? `${value}%`
        : String(value);
  if (minimum !== undefined && maximum !== undefined) return `Enter a value from ${show(minimum)} to ${show(maximum)}.`;
  if (minimum !== undefined) return `Enter ${show(minimum)} or more.`;
  if (maximum !== undefined) return `Enter ${show(maximum)} or less.`;
  return 'Enter a number.';
}

/**
 * What a typed value means for a field. Amounts take "$", commas and a k or m
 * suffix ("500k"); percentages take a "%"; ages are whole years.
 */
export function readField(field: DisplayInputRequestField, raw: string): FieldReading {
  const trimmed = raw.trim();
  if (!trimmed) return { status: 'empty' };

  if (field.kind === 'choice') {
    const option = field.options?.find((item) => item.value === trimmed);
    return option ? { status: 'ok', value: option.value } : { status: 'invalid', message: 'Choose one of the options.' };
  }

  let text = trimmed.replace(/[$,\s]/g, '');
  let scale = 1;
  if (field.kind === 'percent') {
    text = text.replace(/%$/, '');
  } else if (field.kind === 'usd' || field.kind === 'usd_per_year') {
    const suffix = /([km])$/i.exec(text);
    if (suffix) {
      scale = suffix[1].toLowerCase() === 'k' ? 1_000 : 1_000_000;
      text = text.slice(0, -1);
    }
  }
  if (!/^\d*\.?\d+$/.test(text)) {
    return { status: 'invalid', message: field.kind === 'age' ? 'Enter an age in whole years.' : 'Enter a number.' };
  }
  const value = Number(text) * scale;
  if (field.kind === 'age' && !Number.isInteger(value)) return { status: 'invalid', message: 'Enter an age in whole years.' };
  if ((field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum)) {
    return { status: 'invalid', message: rangeMessage(field) };
  }
  return { status: 'ok', value };
}

/** A value written the way its sentence expects it: "$80,000", "5%", "38", "Growth". */
export function formatFieldValue(field: DisplayInputRequestField, value: number | string): string {
  if (field.kind === 'choice') return field.options?.find((option) => option.value === value)?.label ?? String(value);
  if (typeof value !== 'number') return String(value);
  if (field.kind === 'usd' || field.kind === 'usd_per_year') return dollars(value);
  if (field.kind === 'percent') return `${value}%`;
  return String(value);
}

/**
 * The message a completed form sends: one sentence per filled field, in the
 * form's order, then the question. A blank optional field is left out, so the
 * calculator applies its default and says so.
 */
export function composeInputRequestMessage(
  request: DisplayInputRequest,
  values: Record<string, number | string | undefined>
): string {
  const sentences = request.fields.flatMap((field) => {
    const value = values[field.id];
    return value === undefined ? [] : [field.sentence.replace('{value}', formatFieldValue(field, value))];
  });
  return [...sentences, request.question].join(' ');
}
