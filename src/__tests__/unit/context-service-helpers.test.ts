/**
 * src/openai/context-service.ts is 1,037 lines and measured ~2% coverage. It
 * decides what the model is told about a user's finances, so a defect here does
 * not surface as an error — it surfaces as a confidently wrong answer.
 *
 * These cover the pure helpers behind gatherContextSnapshot. The orchestrator
 * itself is not covered here: it fans out to the database, the search provider
 * and the market-data provider, which is integration-shaped work.
 *
 * Loaded with requireActual for the same reason as the plaid tests — the shared
 * unit setup mocks several sibling modules, and this keeps the real code in play.
 */
const {
  buildTransactionSummaries,
  deriveTransactionTypeLabel,
  deriveCategory,
  deriveInvestmentSnapshot,
  buildHomeValueSummary,
  deduplicateLiabilitySections
} = jest.requireActual('../../openai/context-service');

describe('deriveTransactionTypeLabel', () => {
  it.each([
    ['income', '(INCOME)'],
    ['expense', '(EXPENSE)'],
    ['fee', '(FEE)'],
    ['transfer_in', '(TRANSFER_IN)'],
    ['transfer_out', '(TRANSFER_OUT)'],
    ['deposit', '(DEPOSIT)'],
    ['withdrawal', '(WITHDRAWAL)'],
    ['buy', '(BUY)'],
    ['sell', '(SELL)'],
    ['refund', '(REFUND)'],
    ['adjustment', '(ADJUSTMENT)']
  ])('labels aiCategory %s as %s', (aiCategory, expected) => {
    expect(deriveTransactionTypeLabel({ aiCategory })).toBe(expected);
  });

  it('prefers aiCategory over transaction_type', () => {
    // aiCategory is the categorization service's output and respects manual
    // corrections; transaction_type is only a fallback for rows loaded from the
    // database. Reversing this would silently discard user corrections.
    const label = deriveTransactionTypeLabel({ aiCategory: 'income', transaction_type: 'expense' });
    expect(label).toBe('(INCOME)');
  });

  it('falls back to transaction_type when aiCategory is absent', () => {
    expect(deriveTransactionTypeLabel({ transaction_type: 'expense' })).toBe('(EXPENSE)');
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(deriveTransactionTypeLabel({ aiCategory: '  INCOME  ' })).toBe('(INCOME)');
    expect(deriveTransactionTypeLabel({ aiCategory: 'Transfer_In' })).toBe('(TRANSFER_IN)');
  });

  it('returns (OTHER) for an unrecognised, missing or non-string type', () => {
    expect(deriveTransactionTypeLabel({ aiCategory: 'something_else' })).toBe('(OTHER)');
    expect(deriveTransactionTypeLabel({})).toBe('(OTHER)');
    expect(deriveTransactionTypeLabel({ aiCategory: 42 })).toBe('(OTHER)');
  });
});

describe('deriveCategory', () => {
  describe('category array', () => {
    it('joins a category array with a separator', () => {
      expect(deriveCategory({ category: ['FOOD_AND_DRINK', 'COFFEE'] })).toBe('FOOD_AND_DRINK > COFFEE');
    });

    it('drops empty, null and literal "0" members', () => {
      // "0" shows up as a placeholder from upstream and would otherwise render
      // as a category name in the model's context.
      expect(deriveCategory({ category: ['SHOPS', '', null, '0', '  '] })).toBe('SHOPS');
    });

    it('moves on to the next source when every member is filtered out', () => {
      const result = deriveCategory({
        category: ['0', ''],
        personal_finance_category: { primary: 'TRAVEL' }
      });
      expect(result).toBe('TRAVEL');
    });
  });

  describe('category as a comma-separated string', () => {
    it('splits the database form into a joined label', () => {
      // The Transaction type says string[], but rows loaded from the database
      // carry a comma-separated string. Both shapes have to work.
      expect(deriveCategory({ category: 'FOOD_AND_DRINK, FOOD_AND_DRINK_COFFEE' }))
        .toBe('FOOD_AND_DRINK > FOOD_AND_DRINK_COFFEE');
    });

    it('trims members and drops "0" from the string form too', () => {
      expect(deriveCategory({ category: ' SHOPS ,0,  CLOTHING ' })).toBe('SHOPS > CLOTHING');
    });

    it('ignores an empty string', () => {
      expect(deriveCategory({ category: '   ', personal_finance_category: { primary: 'TRAVEL' } })).toBe('TRAVEL');
    });
  });

  describe('personal_finance_category', () => {
    it('combines primary and detailed', () => {
      expect(deriveCategory({ personal_finance_category: { primary: 'TRAVEL', detailed: 'TRAVEL_FLIGHTS' } }))
        .toBe('TRAVEL > TRAVEL_FLIGHTS');
    });

    it('uses primary alone when detailed is absent', () => {
      expect(deriveCategory({ personal_finance_category: { primary: 'TRAVEL' } })).toBe('TRAVEL');
    });
  });

  describe('enriched_data fallbacks', () => {
    it('reads personal_finance_category out of enriched_data', () => {
      const result = deriveCategory({
        enriched_data: { personal_finance_category: { primary: 'ENTERTAINMENT', detailed: 'ENTERTAINMENT_MUSIC' } }
      });
      expect(result).toBe('ENTERTAINMENT > ENTERTAINMENT_MUSIC');
    });

    it('reads a category array out of enriched_data', () => {
      expect(deriveCategory({ enriched_data: { category: ['SHOPS', '0', 'BOOKS'] } })).toBe('SHOPS > BOOKS');
    });

    it('reads a category string out of enriched_data', () => {
      expect(deriveCategory({ enriched_data: { category: 'SHOPS, BOOKS' } })).toBe('SHOPS > BOOKS');
    });

    it('prefers a top-level category over enriched_data', () => {
      const result = deriveCategory({
        category: ['TOP_LEVEL'],
        enriched_data: { personal_finance_category: { primary: 'ENRICHED' } }
      });
      expect(result).toBe('TOP_LEVEL');
    });
  });

  describe('name-based inference when no category is present', () => {
    it.each([
      ['Monthly Rent Payment', 'RENT_AND_UTILITIES'],
      ['Apartment Fees', 'RENT_AND_UTILITIES'],
      ['City Water Bill', 'RENT_AND_UTILITIES'],
      ['Electric Company', 'RENT_AND_UTILITIES'],
      ['Whole Foods Grocery', 'FOOD_AND_DRINK'],
      ['Corner Cafe', 'FOOD_AND_DRINK'],
      ['Chevron Fuel', 'TRANSPORTATION'],
      ['EXXON', 'TRANSPORTATION'],
      ['Amazon Marketplace', 'GENERAL_MERCHANDISE'],
      ['Walmart Supercenter', 'GENERAL_MERCHANDISE']
    ])('infers %s as %s', (name, expected) => {
      expect(deriveCategory({ name })).toBe(expected);
    });

    it.each(['Shell Gas Station', 'Costco Gas', 'BP Gas'])(
      'KNOWN DEFECT: files %s as RENT_AND_UTILITIES rather than TRANSPORTATION',
      (name) => {
        // The utilities rule tests for 'gas' (meaning a gas utility bill) and runs
        // before the transportation rule, so the transportation rule's own 'gas'
        // keyword is unreachable. Any fuel purchase whose name contains "gas" —
        // which is most of them — is filed as a utility bill, and that flows into
        // the spending breakdown the model is given.
        //
        // Pinned rather than fixed: correcting it changes how real transactions
        // categorize, which is a product decision, not a test cleanup. When it is
        // fixed, this expectation should flip to TRANSPORTATION.
        expect(deriveCategory({ name })).toBe('RENT_AND_UTILITIES');
      }
    );

    it('falls back to the merchant name when nothing else matches', () => {
      expect(deriveCategory({ name: 'POS 4429', merchant_name: 'Blue Bottle' })).toBe('MERCHANT: blue bottle');
      expect(deriveCategory({ name: 'POS 4429', merchantName: 'Blue Bottle' })).toBe('MERCHANT: blue bottle');
    });

    it('returns undefined when there is nothing to go on', () => {
      expect(deriveCategory({ name: 'POS 4429' })).toBeUndefined();
      expect(deriveCategory({})).toBeUndefined();
    });
  });
});

describe('buildTransactionSummaries', () => {
  it('prefers transaction_id, then id, then a composite key', () => {
    const [withTxnId] = buildTransactionSummaries([
      { transaction_id: 'txn-1', id: 'other', account_id: 'a', date: '2026-01-01', name: 'X' }
    ]);
    const [withId] = buildTransactionSummaries([
      { id: 'row-1', account_id: 'a', date: '2026-01-01', name: 'X' }
    ]);
    const [withNeither] = buildTransactionSummaries([
      { account_id: 'acct-9', date: '2026-01-01', name: 'Coffee' }
    ]);
    expect(withTxnId.id).toBe('txn-1');
    expect(withId.id).toBe('row-1');
    expect(withNeither.id).toBe('acct-9-2026-01-01-Coffee');
  });

  it('coerces the amount and treats an unparseable one as zero', () => {
    const [numeric] = buildTransactionSummaries([{ name: 'A', amount: '12.5' }]);
    const [broken] = buildTransactionSummaries([{ name: 'B', amount: 'not-a-number' }]);
    const [missing] = buildTransactionSummaries([{ name: 'C' }]);
    expect(numeric.amount).toBe(12.5);
    expect(broken.amount).toBe(0);
    expect(missing.amount).toBe(0);
  });

  it('labels an unnamed transaction Unknown rather than emitting an empty name', () => {
    const [summary] = buildTransactionSummaries([{ amount: 5 }]);
    expect(summary.name).toBe('Unknown');
  });

  it('takes the merchant from merchantName, then enriched merchant_name, then brand_name', () => {
    const [direct] = buildTransactionSummaries([{ name: 'A', merchantName: 'Direct' }]);
    const [enriched] = buildTransactionSummaries([{ name: 'B', enriched_data: { merchant_name: 'Enriched' } }]);
    const [brand] = buildTransactionSummaries([{ name: 'C', enriched_data: { brand_name: 'Brand' } }]);
    expect(direct.merchantName).toBe('Direct');
    expect(enriched.merchantName).toBe('Enriched');
    expect(brand.merchantName).toBe('Brand');
  });

  it('attaches account name and institution when an account map is supplied', () => {
    const accountMap = new Map([['acct-1', { name: 'Everyday Checking', institution: 'Chase' }]]);
    const [summary] = buildTransactionSummaries([{ name: 'A', account_id: 'acct-1' }], accountMap);
    expect(summary.accountName).toBe('Everyday Checking');
    expect(summary.accountInstitution).toBe('Chase');
  });

  it('leaves account fields undefined for an unknown account or no map', () => {
    const accountMap = new Map([['acct-1', { name: 'Everyday Checking', institution: 'Chase' }]]);
    const [unknownAccount] = buildTransactionSummaries([{ name: 'A', account_id: 'acct-nope' }], accountMap);
    const [noMap] = buildTransactionSummaries([{ name: 'A', account_id: 'acct-1' }]);
    expect(unknownAccount.accountName).toBeUndefined();
    expect(noMap.accountName).toBeUndefined();
  });

  it('carries the derived type and category through onto each summary', () => {
    const [summary] = buildTransactionSummaries([
      { name: 'Paycheck', aiCategory: 'income', category: ['INCOME', 'WAGES'], amount: 3000, date: '2026-01-15' }
    ]);
    expect(summary.typeLabel).toBe('(INCOME)');
    expect(summary.categoryLabel).toBe('INCOME > WAGES');
    expect(summary.date).toBe('2026-01-15');
  });

  it('returns an empty list for no transactions', () => {
    expect(buildTransactionSummaries([])).toEqual([]);
  });
});

describe('deriveInvestmentSnapshot', () => {
  const holding = (over: any = {}) => ({ institution_value: 100, security_name: 'Fund', ...over });

  it('returns undefined when there are no holdings', () => {
    expect(deriveInvestmentSnapshot({ holdings: [] })).toBeUndefined();
    expect(deriveInvestmentSnapshot({})).toBeUndefined();
    expect(deriveInvestmentSnapshot(undefined)).toBeUndefined();
  });

  it('totals institution_value and counts holdings', () => {
    const snapshot = deriveInvestmentSnapshot({
      holdings: [holding({ institution_value: 1000 }), holding({ institution_value: 250.5 })]
    });
    expect(snapshot.totalValue).toBe(1250.5);
    expect(snapshot.holdingCount).toBe(2);
  });

  it('treats a missing institution_value as zero rather than producing NaN', () => {
    const snapshot = deriveInvestmentSnapshot({ holdings: [holding({ institution_value: undefined }), holding()] });
    expect(snapshot.totalValue).toBe(100);
  });

  it('names a line by security_name, then ticker_symbol, then a generic label', () => {
    const snapshot = deriveInvestmentSnapshot({
      holdings: [
        holding({ security_name: 'Apple Inc.', institution_value: 10 }),
        holding({ security_name: undefined, ticker_symbol: 'MSFT', institution_value: 20 }),
        holding({ security_name: undefined, ticker_symbol: undefined, institution_value: 30 })
      ]
    });
    expect(snapshot.summaryLines).toEqual(['- Apple Inc.: $10.00', '- MSFT: $20.00', '- Holding: $30.00']);
  });

  it('caps the summary at ten lines while still counting every holding', () => {
    // The lines go into the model's context; the count must stay accurate even
    // though the listing is truncated.
    const holdings = Array.from({ length: 25 }, (_, i) => holding({ institution_value: i + 1 }));
    const snapshot = deriveInvestmentSnapshot({ holdings });
    expect(snapshot.summaryLines).toHaveLength(10);
    expect(snapshot.holdingCount).toBe(25);
    expect(snapshot.totalValue).toBe(325);
  });
});

describe('buildHomeValueSummary', () => {
  it('formats address and estimated value as currency', () => {
    const summary = buildHomeValueSummary({ address: '1 Main St', valueMid: 750000 });
    expect(summary).toContain('Address: 1 Main St');
    expect(summary).toContain('Estimated value: $750,000');
  });

  it('includes a range line only when both bounds are present', () => {
    const both = buildHomeValueSummary({ address: '1 Main St', valueMid: 750000, valueLow: 700000, valueHigh: 800000 });
    const lowOnly = buildHomeValueSummary({ address: '1 Main St', valueMid: 750000, valueLow: 700000 });
    expect(both).toContain('Estimated range: $700,000 – $800,000');
    expect(lowOnly).not.toContain('Estimated range');
  });

  it('reports an unusable estimate as Unknown instead of NaN', () => {
    expect(buildHomeValueSummary({ address: '1 Main St', valueMid: null })).toContain('Estimated value: Unknown');
    expect(buildHomeValueSummary({ address: '1 Main St', valueMid: NaN })).toContain('Estimated value: Unknown');
  });

  it('includes a last-updated line only when a timestamp is supplied', () => {
    const withDate = buildHomeValueSummary({
      address: '1 Main St',
      valueMid: 750000,
      lastUpdated: '2026-01-15T00:00:00.000Z'
    });
    const withoutDate = buildHomeValueSummary({ address: '1 Main St', valueMid: 750000 });
    expect(withDate).toMatch(/Last updated: \w{3} \d{1,2}, \d{4}/);
    expect(withoutDate).not.toContain('Last updated');
  });

  it('emits one line per populated field and nothing for the empty ones', () => {
    const summary = buildHomeValueSummary({ address: '1 Main St', valueMid: 750000 });
    expect(summary.split('\n')).toHaveLength(2);
  });
});

describe('deduplicateLiabilitySections', () => {
  it('leaves text with no liabilities section untouched', () => {
    const text = '# User Profile\nSome details.';
    expect(deduplicateLiabilitySections(text)).toBe(text);
  });

  it('leaves a single liabilities section untouched', () => {
    const text = '# User Profile\nDetails.\n\nLIABILITIES INFORMATION:\n- Mortgage: $400,000';
    expect(deduplicateLiabilitySections(text)).toBe(text);
  });

  it('keeps the most complete section when the same one appears twice', () => {
    // Duplicated sections waste context and can contradict each other, so the
    // longest (most complete) copy wins.
    const text = [
      '# User Profile',
      'Details.',
      '',
      'LIABILITIES INFORMATION:\n- Mortgage: $400,000',
      '',
      'LIABILITIES INFORMATION:\n- Mortgage: $400,000\n- Car loan: $18,000\n- Student loan: $22,000',
      '',
      '# Accounts',
      'Checking'
    ].join('\n');

    const result = deduplicateLiabilitySections(text);
    expect(result.match(/LIABILITIES INFORMATION:/g)).toHaveLength(1);
    expect(result).toContain('Student loan: $22,000');
    expect(result).toContain('# Accounts');
  });

  it('never leaves the profile without the liabilities it kept', () => {
    const text = [
      'LIABILITIES INFORMATION:\n- A',
      '',
      'LIABILITIES INFORMATION:\n- A\n- B',
      '',
      '# Accounts'
    ].join('\n');
    const result = deduplicateLiabilitySections(text);
    expect(result).toContain('LIABILITIES INFORMATION:');
    expect(result).toContain('- B');
  });

  it('collapses runs of blank lines left behind by a removal', () => {
    const text = [
      '# User Profile',
      '',
      'LIABILITIES INFORMATION:\n- A',
      '',
      'LIABILITIES INFORMATION:\n- A\n- B\n- C',
      '',
      '# Accounts'
    ].join('\n');
    expect(deduplicateLiabilitySections(text)).not.toMatch(/\n{3,}/);
  });
});
