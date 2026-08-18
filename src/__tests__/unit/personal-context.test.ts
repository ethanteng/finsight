import {
  applyPersonalContextOperations,
  formatPersonalContextForModel,
  parseStoredPersonalContextDocument,
  personalContextFromLegacyText,
  personalContextValues,
  replacePersonalContextManually,
  serializePersonalContextDocument,
  type PersonalContextFacts,
} from '../../profile/personal-context';

describe('personal context', () => {
  const observedAt = '2026-08-18T12:00:00.000Z';

  it('applies explicit field patches and replaces superseded values', () => {
    const existing: PersonalContextFacts = {
      age: { value: 40, observedAt, source: 'conversation' },
      occupation: { value: 'Engineer', observedAt, source: 'conversation' },
    };
    const updated = applyPersonalContextOperations(existing, [
      {
        field: 'age', action: 'set', stringValue: null, numberValue: 41,
        numberListValue: [], evidence: "I'm 41 now",
      },
    ], {
      question: "I'm 41 now; I had a birthday last week.",
      conversationId: 'conversation-2',
      observedAt: '2026-08-19T12:00:00.000Z',
    });

    expect(personalContextValues(updated)).toEqual({ age: 41, occupation: 'Engineer' });
    expect(updated.age?.sourceConversationId).toBe('conversation-2');
  });

  it('rejects a patch whose evidence is not an exact quote from the user', () => {
    const updated = applyPersonalContextOperations({}, [
      {
        field: 'occupation', action: 'set', stringValue: 'Teacher', numberValue: null,
        numberListValue: [], evidence: 'The user is probably a teacher',
      },
    ], {
      question: 'How much should teachers save for retirement?',
      conversationId: 'conversation-1',
      observedAt,
    });
    expect(updated).toEqual({});
  });

  it('rejects a number from a hypothetical question as the user age', () => {
    const updated = applyPersonalContextOperations({}, [
      {
        field: 'age', action: 'set', stringValue: null, numberValue: 35,
        numberListValue: [], evidence: 'a 35-year-old',
      },
    ], {
      question: 'How much should a 35-year-old save?',
      conversationId: 'conversation-1',
      observedAt,
    });
    expect(updated).toEqual({});
  });

  it('does not treat a possible move as the current location', () => {
    const updated = applyPersonalContextOperations({}, [
      {
        field: 'city', action: 'set', stringValue: 'Austin', numberValue: null,
        numberListValue: [], evidence: 'Should I move to Austin',
      },
    ], {
      question: 'Should I move to Austin?',
      conversationId: 'conversation-1',
      observedAt,
    });
    expect(updated).toEqual({});
  });

  it('does not persist forbidden financial details hidden inside an allowed string field', () => {
    const updated = applyPersonalContextOperations({}, [
      {
        field: 'occupation', action: 'set', stringValue: 'Engineer earning $200,000', numberValue: null,
        numberListValue: [], evidence: 'I am an Engineer earning $200,000',
      },
    ], {
      question: 'I am an Engineer earning $200,000.',
      conversationId: 'conversation-1',
      observedAt,
    });
    expect(updated).toEqual({});
  });

  it('uses evidence to validate a patch without retaining the quoted message', () => {
    const updated = applyPersonalContextOperations({}, [
      {
        field: 'occupation', action: 'set', stringValue: 'Engineer', numberValue: null,
        numberListValue: [], evidence: 'I am an Engineer earning $200,000',
      },
    ], {
      question: 'I am an Engineer earning $200,000.',
      conversationId: 'conversation-1',
      observedAt,
    });
    expect(updated.occupation).toEqual(expect.objectContaining({ value: 'Engineer' }));
    expect(JSON.stringify(updated)).not.toContain('200,000');
  });

  it('clears only the explicitly named memory', () => {
    const existing = replacePersonalContextManually({ age: 42, occupation: 'Teacher' }, observedAt);
    const updated = applyPersonalContextOperations(existing, [
      {
        field: 'occupation', action: 'clear', stringValue: null, numberValue: null,
        numberListValue: [], evidence: 'forget my occupation',
      },
    ], {
      question: 'Please forget my occupation.', conversationId: 'conversation-3', observedAt,
    });
    expect(personalContextValues(updated)).toEqual({ age: 42 });
  });

  it('round-trips bounded facts and home data in the encrypted document payload', () => {
    const facts = replacePersonalContextManually({
      preferredName: 'Ethan', age: 42, dependentCount: 2, dependentAges: [11, 8],
    }, observedAt);
    const serialized = serializePersonalContextDocument(facts, {
      address: '123 Main St, Austin, TX', rentCastValue: 500_000, manualValue: null,
      valueLow: 450_000, valueHigh: 550_000, lastUpdated: observedAt,
    }, observedAt);
    const parsed = parseStoredPersonalContextDocument(serialized);
    expect(personalContextValues(parsed?.facts || {})).toEqual({
      preferredName: 'Ethan', age: 42, dependentCount: 2, dependentAges: [8, 11],
    });
    expect(parsed?.home?.rentCastValue).toBe(500_000);
  });

  it('imports only conservative biographical facts from a legacy profile', () => {
    const legacy = 'The user is 45 years old, married, lives in Austin, Texas, and works as a software engineer earning $200,000. Total Portfolio Value: $2,000,000.';
    const values = personalContextValues(personalContextFromLegacyText(legacy, observedAt));
    expect(values.age).toBe(45);
    expect(values.householdStatus).toBe('married');
    expect(values.city).toBe('Austin');
    expect(values.stateOrProvince).toBe('Texas');
    expect(values.occupation).toBe('software engineer');
    expect(JSON.stringify(values)).not.toContain('200,000');
    expect(JSON.stringify(values)).not.toContain('2,000,000');
  });

  it('formats age in a form the retirement input parser can consume', () => {
    const facts = replacePersonalContextManually({ age: 52, employmentStatus: 'employed' }, observedAt);
    expect(formatPersonalContextForModel(facts)).toContain('The user is 52 years old.');
  });

  it('rejects unsupported or malformed manual values', () => {
    expect(() => replacePersonalContextManually({ age: 200 }, observedAt)).toThrow('Invalid personal context');
    expect(() => replacePersonalContextManually({ householdStatus: 'wealthy' }, observedAt)).toThrow('Invalid personal context');
    expect(() => replacePersonalContextManually({ financialGoals: 'Retire early' }, observedAt)).toThrow('Invalid personal context field');
    expect(() => replacePersonalContextManually({ dependentCount: 1, dependentAges: [4, 7] }, observedAt)).toThrow('Invalid personal context');
  });
});
