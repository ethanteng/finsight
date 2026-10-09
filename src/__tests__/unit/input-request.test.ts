/**
 * The form a calculator hands the client when it is waiting on figures only
 * the user has: what it asks for, what it already shows, and that a stored
 * one is checked before it goes back out.
 */
import { describe, expect, it } from '@jest/globals';
import { buildInputRequest, parseInputRequest, type InputRequestSpec } from '../../openai/input-request';
import { scenarioCalculatorRegistry } from '../../scenarios/calculator-registry';

const SPEC: InputRequestSpec = {
  calculatorId: 'example',
  title: 'Your figures',
  question: 'Does this work?',
  submitLabel: 'Run it',
  fields: [
    { id: 'retirementAge', label: 'Retirement age', kind: 'age', minimum: 30, maximum: 95, sentence: 'I plan to retire at {value}.', defaultNote: '65 if left blank' },
    { id: 'currentAge', label: 'Your age', kind: 'age', minimum: 18, maximum: 90, sentence: 'I am {value} years old.' },
    { id: 'savings', label: 'Invested today', kind: 'usd', sentence: 'I have {value} invested.' },
    { id: 'mix', label: 'Preset mix', kind: 'choice', options: [{ value: 'growth', label: 'Growth' }], sentence: 'Use the {value} preset mix.', defaultNote: 'Balanced if left blank' },
  ],
};

describe('building the form', () => {
  it('puts what is missing first, then what Linc holds, then the defaults', () => {
    const request = buildInputRequest(SPEC, ['currentAge'], [
      { key: 'savings', value: 500_000, origin: 'snapshot', basis: 'entered' },
    ])!;

    expect(request.fields.map((field) => field.id)).toEqual(['currentAge', 'savings', 'retirementAge', 'mix']);
    expect(request.fields[0]).toMatchObject({ required: true, minimum: 18, maximum: 90 });
    expect(request.fields[0]).not.toHaveProperty('value');
    expect(request.fields[1]).toMatchObject({
      required: false,
      value: 500_000,
      valueNote: 'From what you entered on the Finances page',
    });
    expect(request.fields[1]).not.toHaveProperty('defaultNote');
    expect(request.fields[2]).toMatchObject({ required: false, defaultNote: '65 if left blank' });
    expect(request.fields[3].options).toEqual([{ value: 'growth', label: 'Growth' }]);
  });

  it('says where each figure it already holds came from', () => {
    const notes = buildInputRequest(SPEC, ['savings'], [
      { key: 'currentAge', value: 38, origin: 'profile' },
      { key: 'retirementAge', value: 55, origin: 'user' },
    ])!.fields.map((field) => field.valueNote);

    expect(notes).toEqual([undefined, 'From what you said earlier', 'From what you told me before', undefined]);
  });

  it('asks for nothing when nothing is missing', () => {
    expect(buildInputRequest(SPEC, [])).toBeNull();
  });
});

describe('a stored form', () => {
  const built = buildInputRequest(SPEC, ['currentAge'], [{ key: 'mix', value: 'growth', origin: 'user' }])!;

  it('reads back exactly as it was written', () => {
    expect(parseInputRequest(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it('is dropped whole when any part of it does not hold together', () => {
    const broken = (change: (copy: any) => void) => {
      const copy = JSON.parse(JSON.stringify(built));
      change(copy);
      return parseInputRequest(copy);
    };

    expect(broken((copy) => { copy.fields[0].sentence = 'No place for the figure.'; })).toBeNull();
    expect(broken((copy) => { copy.fields[0].kind = 'html'; })).toBeNull();
    expect(broken((copy) => { copy.fields[0].id = 'current-age<script>'; })).toBeNull();
    expect(broken((copy) => { copy.fields.find((field: any) => field.id === 'mix').options = []; })).toBeNull();
    expect(broken((copy) => { copy.fields = []; })).toBeNull();
    expect(broken((copy) => { delete copy.question; })).toBeNull();
    expect(broken((copy) => { copy.fields[0].requireWhen = { fieldId: 'bad-id', minimum: 65 }; })).toBeNull();
    expect(parseInputRequest(undefined)).toBeNull();
    expect(parseInputRequest('a form')).toBeNull();
  });

  it('keeps a requireWhen rule that names a real sibling field', () => {
    const withRule = {
      ...built,
      fields: built.fields.map((field) =>
        field.id === 'retirementAge'
          ? { ...field, requireWhen: { fieldId: 'currentAge', minimum: 65 } }
          : field
      ),
    };
    expect(parseInputRequest(JSON.parse(JSON.stringify(withRule)))).toEqual(withRule);
  });
});

describe('the registry', () => {
  it('hands over one form, from the first calculator that is waiting on figures', () => {
    const waiting = (calculator: string, missingFields: string[]) => ({
      version: 1,
      calculator,
      status: 'unavailable' as const,
      computedAt: '2026-10-09T00:00:00.000Z',
      durationMs: 1,
      reason: 'Missing figures.',
      missingInputs: missingFields.map((field) => `your ${field}`),
      missingFields,
    });

    const request = scenarioCalculatorRegistry.inputRequest({
      coast_fire: waiting('coast_fire', ['currentSavings']),
      stated_retirement_plan: waiting('stated_retirement_plan', ['currentAge']),
    });
    expect(request?.calculatorId).toBe('coast_fire');
    expect(scenarioCalculatorRegistry.inputRequest({})).toBeNull();
    expect(scenarioCalculatorRegistry.inputRequest(undefined)).toBeNull();
  });
});
