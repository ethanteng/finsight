/**
 * A form for the figures a calculator needs and nobody has stated.
 *
 * Coast FIRE and the stated retirement plan run from what the user tells Linc,
 * so a first question usually arrives without some of it. They have always
 * asked in words ("I need your current age and how much you have invested"),
 * and the user then typed a free-text reply for the planner to read again.
 * That works for one figure and gets clumsy at four, and it leaves the user
 * guessing which assumptions they could have set.
 *
 * The answer now also carries this: the fields the calculator needs, the ones
 * Linc already holds (pre-filled, saying where they came from), and the ones
 * with a named default. Submitting it does not open a second path for numbers.
 * The client writes the figures into an ordinary message, one server-authored
 * sentence per field, and sends it as the user's next turn in the decision, so
 * the planner reads them, traces each to the user's wording, and every rule
 * about stated figures applies unchanged.
 */

import type { BalanceBasis } from './linked-data';

export type InputRequestFieldKind = 'age' | 'usd' | 'usd_per_year' | 'percent' | 'choice';

export interface InputRequestOption {
  value: string;
  label: string;
}

export interface InputRequestField {
  /** The calculator's own name for the field. */
  id: string;
  label: string;
  kind: InputRequestFieldKind;
  /** Nothing can stand in for it: the calculation does not run without it. */
  required: boolean;
  minimum?: number;
  maximum?: number;
  /** For a choice: the values the calculator accepts, with what the user sees. */
  options?: InputRequestOption[];
  /** What Linc already holds for the field, which the form shows filled in. */
  value?: number | string;
  /** Where `value` came from, in the user's terms. */
  valueNote?: string;
  /** What the calculator uses when the field is left blank. */
  defaultNote?: string;
  /** The sentence the figure is sent in, with `{value}` where it goes. */
  sentence: string;
}

export interface InputRequest {
  calculatorId: string;
  title: string;
  /** The question the message closes on, so the planner knows what to run. */
  question: string;
  submitLabel: string;
  fields: InputRequestField[];
}

/** A figure the calculator resolved before it found one missing, and where it came from. */
export interface KnownInput {
  key: string;
  value: number | string;
  origin: 'user' | 'profile' | 'snapshot';
  basis?: BalanceBasis;
}

export interface InputFieldSpec {
  id: string;
  label: string;
  kind: InputRequestFieldKind;
  minimum?: number;
  maximum?: number;
  options?: readonly InputRequestOption[];
  sentence: string;
  defaultNote?: string;
}

export interface InputRequestSpec {
  calculatorId: string;
  title: string;
  question: string;
  submitLabel: string;
  fields: readonly InputFieldSpec[];
}

function describeOrigin(input: KnownInput): string {
  if (input.origin === 'user') return 'From what you said earlier';
  if (input.origin === 'profile') return 'From what you told me before';
  if (input.basis === 'entered') return 'From what you entered on the Finances page';
  if (input.basis === 'linked_and_entered') return 'From your linked accounts and what you entered';
  return 'From your linked accounts';
}

/**
 * The form for one calculator: the missing fields first, then what Linc
 * already holds, then the rest with their defaults. Null when nothing is
 * missing, since a calculation that ran has nothing to ask.
 */
export function buildInputRequest(
  spec: InputRequestSpec,
  missingFields: readonly string[],
  knownInputs: readonly KnownInput[] = []
): InputRequest | null {
  if (missingFields.length === 0) return null;
  const known = new Map(knownInputs.map((input) => [input.key, input]));
  const fields: InputRequestField[] = spec.fields.map((field) => {
    const required = missingFields.includes(field.id);
    const held = required ? undefined : known.get(field.id);
    return {
      id: field.id,
      label: field.label,
      kind: field.kind,
      required,
      ...(field.minimum !== undefined && { minimum: field.minimum }),
      ...(field.maximum !== undefined && { maximum: field.maximum }),
      ...(field.options && { options: field.options.map((option) => ({ ...option })) }),
      ...(held && { value: held.value, valueNote: describeOrigin(held) }),
      ...(!required && !held && field.defaultNote && { defaultNote: field.defaultNote }),
      sentence: field.sentence,
    };
  });
  const rank = (field: InputRequestField) => (field.required ? 0 : field.value !== undefined ? 1 : 2);
  return {
    calculatorId: spec.calculatorId,
    title: spec.title,
    question: spec.question,
    submitLabel: spec.submitLabel,
    // A stable sort keeps the calculator's own order within each group.
    fields: fields.map((field, index) => ({ field, index }))
      .sort((left, right) => rank(left.field) - rank(right.field) || left.index - right.index)
      .map(({ field }) => field),
  };
}

const FIELD_KINDS: readonly InputRequestFieldKind[] = ['age', 'usd', 'usd_per_year', 'percent', 'choice'];
const MAX_FIELDS = 12;
const MAX_OPTIONS = 8;

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseField(value: unknown): InputRequestField | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = text(record.id, 40);
  const label = text(record.label, 120);
  const sentence = text(record.sentence, 240);
  const kind = FIELD_KINDS.find((item) => item === record.kind);
  if (!id || !/^[A-Za-z]+$/.test(id) || !label || !sentence || !sentence.includes('{value}') || !kind) return null;
  if (typeof record.required !== 'boolean') return null;

  let options: InputRequestOption[] | undefined;
  if (kind === 'choice') {
    if (!Array.isArray(record.options) || record.options.length === 0 || record.options.length > MAX_OPTIONS) return null;
    options = [];
    for (const option of record.options as unknown[]) {
      const entry = option && typeof option === 'object' ? option as Record<string, unknown> : {};
      const optionValue = text(entry.value, 40);
      const optionLabel = text(entry.label, 80);
      if (!optionValue || !optionLabel) return null;
      options.push({ value: optionValue, label: optionLabel });
    }
  }
  const minimum = finite(record.minimum);
  const maximum = finite(record.maximum);
  const held = finite(record.value) ?? text(record.value, 40);
  const valueNote = text(record.valueNote, 160);
  const defaultNote = text(record.defaultNote, 160);
  return {
    id,
    label,
    kind,
    required: record.required,
    ...(minimum !== undefined && { minimum }),
    ...(maximum !== undefined && { maximum }),
    ...(options && { options }),
    ...(held !== undefined && { value: held }),
    ...(valueNote && { valueNote }),
    ...(defaultNote && { defaultNote }),
    sentence,
  };
}

/**
 * A stored form, checked field by field before it is handed back to a client.
 * The server wrote it, but it is read back out of a JSON column, and a form
 * that does not hold together is dropped rather than half-rendered.
 */
export function parseInputRequest(value: unknown): InputRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const calculatorId = text(record.calculatorId, 64);
  const title = text(record.title, 120);
  const question = text(record.question, 200);
  const submitLabel = text(record.submitLabel, 60);
  if (!calculatorId || !title || !question || !submitLabel) return null;
  if (!Array.isArray(record.fields) || record.fields.length === 0 || record.fields.length > MAX_FIELDS) return null;
  const fields: InputRequestField[] = [];
  for (const item of record.fields as unknown[]) {
    const field = parseField(item);
    if (!field) return null;
    fields.push(field);
  }
  return { calculatorId, title, question, submitLabel, fields };
}
