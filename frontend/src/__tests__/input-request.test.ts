import {
  composeInputRequestMessage,
  fieldIsRequired,
  initialFieldText,
  readField,
  type DisplayInputRequest,
  type DisplayInputRequestField,
} from '@/lib/input-request';

const age: DisplayInputRequestField = { id: 'currentAge', label: 'Your age', kind: 'age', required: true, minimum: 18, maximum: 90, sentence: 'I am {value} years old.' };
const savings: DisplayInputRequestField = { id: 'currentSavings', label: 'Invested', kind: 'usd', required: true, minimum: 0, maximum: 100_000_000, sentence: 'I have {value} invested for retirement today.' };
const spending: DisplayInputRequestField = { id: 'annualRetirementSpending', label: 'Spending', kind: 'usd_per_year', required: false, minimum: 1_000, maximum: 10_000_000, value: 80_000, sentence: 'I expect to spend {value} a year once I stop working, in today\'s dollars.' };
const growth: DisplayInputRequestField = { id: 'realReturnRatePercent', label: 'Growth', kind: 'percent', required: false, minimum: 0, maximum: 12, defaultNote: '5% if left blank', sentence: 'Assume {value} growth a year after inflation.' };
const mix: DisplayInputRequestField = { id: 'allocation', label: 'Preset mix', kind: 'choice', required: false, options: [{ value: 'growth', label: 'Growth' }], sentence: 'Use the {value} preset mix.' };

describe('reading what was typed', () => {
  it('takes amounts the way people write them', () => {
    expect(readField(savings, '$500,000')).toEqual({ status: 'ok', value: 500_000 });
    expect(readField(savings, '500k')).toEqual({ status: 'ok', value: 500_000 });
    expect(readField(savings, '1.2M')).toEqual({ status: 'ok', value: 1_200_000 });
    expect(readField(growth, '5%')).toEqual({ status: 'ok', value: 5 });
    expect(readField(growth, '4.5')).toEqual({ status: 'ok', value: 4.5 });
  });

  it('keeps ages whole and every figure inside the calculator\'s bounds', () => {
    expect(readField(age, '38')).toEqual({ status: 'ok', value: 38 });
    expect(readField(age, '38.5')).toEqual({ status: 'invalid', message: 'Enter an age in whole years.' });
    expect(readField(age, '12')).toEqual({ status: 'invalid', message: 'Enter a value from 18 to 90.' });
    expect(readField(growth, '20%')).toEqual({ status: 'invalid', message: 'Enter a value from 0% to 12%.' });
    expect(readField(savings, 'lots')).toEqual({ status: 'invalid', message: 'Enter a number.' });
    expect(readField(savings, '-5')).toMatchObject({ status: 'invalid' });
    expect(readField(age, '  ')).toEqual({ status: 'empty' });
  });

  it('accepts only the choices offered', () => {
    expect(readField(mix, 'growth')).toEqual({ status: 'ok', value: 'growth' });
    expect(readField(mix, 'aggressive')).toMatchObject({ status: 'invalid' });
  });

  it('opens a held figure the way someone would type it', () => {
    expect(initialFieldText(spending)).toBe('80,000');
    expect(initialFieldText(age)).toBe('');
    expect(initialFieldText({ ...mix, value: 'growth' })).toBe('growth');
  });
});

describe('the message a form sends', () => {
  const request: DisplayInputRequest = {
    calculatorId: 'coast_fire',
    title: 'Your Coast FIRE figures',
    question: 'What is my Coast FIRE number?',
    submitLabel: 'Work out my Coast FIRE number',
    fields: [age, savings, spending, growth, mix],
  };

  it('writes each filled figure into its sentence, then asks the question', () => {
    expect(composeInputRequestMessage(request, {
      currentAge: 38,
      currentSavings: 500_000,
      annualRetirementSpending: 80_000,
      allocation: 'growth',
    })).toBe(
      'I am 38 years old. I have $500,000 invested for retirement today. ' +
      'I expect to spend $80,000 a year once I stop working, in today\'s dollars. ' +
      'Use the Growth preset mix. What is my Coast FIRE number?'
    );
  });

  it('leaves a blank optional figure to its default', () => {
    expect(composeInputRequestMessage(request, { currentAge: 38, currentSavings: 500_000 }))
      .not.toContain('growth a year');
  });
});

describe('requireWhen', () => {
  const retirementAge: DisplayInputRequestField = {
    id: 'retirementAge',
    label: 'Retirement age',
    kind: 'age',
    required: false,
    minimum: 30,
    maximum: 95,
    defaultNote: '65 if you are under 65',
    requireWhen: { fieldId: 'currentAge', minimum: 65 },
    sentence: 'I plan to retire at {value}.',
  };
  const fields = [age, retirementAge];

  it('stays optional while the sibling age is under the threshold', () => {
    expect(fieldIsRequired(retirementAge, { currentAge: '38' }, fields)).toBe(false);
  });

  it('becomes needed once the sibling age reaches the threshold', () => {
    expect(fieldIsRequired(retirementAge, { currentAge: '65' }, fields)).toBe(true);
    expect(fieldIsRequired(retirementAge, { currentAge: '70' }, fields)).toBe(true);
  });
});
