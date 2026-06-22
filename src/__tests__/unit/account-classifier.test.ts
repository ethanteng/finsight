import { describe, expect, it } from '@jest/globals';
import { classifyAccount, getAccountBalance } from '../../services/account-classifier';

describe('account-classifier', () => {
  describe('getAccountBalance', () => {
    it('reads current, then available, then 0', () => {
      expect(getAccountBalance({ balance: { current: 100, available: 50 } })).toBe(100);
      expect(getAccountBalance({ balance: { current: null, available: 50 } })).toBe(50);
      expect(getAccountBalance({ balance: { current: 0, available: 50 } })).toBe(0);
      expect(getAccountBalance({ balance: 42 })).toBe(42);
      expect(getAccountBalance({ balance: null })).toBe(0);
      expect(getAccountBalance({})).toBe(0);
    });
  });

  describe('cash classification', () => {
    it('treats depository accounts as cash', () => {
      const c = classifyAccount({ type: 'depository', subtype: 'checking', balance: { current: 100 } });
      expect(c.category).toBe('cash');
      expect(c.isCash).toBe(true);
      expect(c.isInvestment).toBe(false);
      expect(c.isDebt).toBe(false);
    });

    it('treats cd / money market / cash management as cash', () => {
      for (const subtype of ['cd', 'money market', 'cash management', 'savings', 'prepaid']) {
        expect(classifyAccount({ type: 'depository', subtype, balance: { current: 1 } }).category).toBe('cash');
      }
    });

    it('REGRESSION: a depository HSA with a cash balance is cash, never dropped', () => {
      // An HSA modeled as a depository account with no investment holdings must
      // count as cash so its balance is not silently removed from net worth.
      const c = classifyAccount({ type: 'depository', subtype: 'hsa', balance: { current: 6009 } });
      expect(c.category).toBe('cash');
      expect(c.isCash).toBe(true);
      expect(c.isInvestment).toBe(false);
    });

    it('flags overdraft via liabilityKey', () => {
      const c = classifyAccount({ type: 'depository', subtype: 'checking', balance: { current: -200 } });
      expect(c.isCash).toBe(true);
      expect(c.liabilityKey).toBe('overdraft');
    });
  });

  describe('investment classification', () => {
    it('classifies investment-type retirement subtypes as retirement', () => {
      for (const subtype of ['401k', 'ira', 'roth', 'hsa', 'pension', '529']) {
        const c = classifyAccount({ type: 'investment', subtype, balance: { current: 100 } });
        expect(c.category).toBe('retirement');
        expect(c.isInvestment).toBe(true);
        expect(c.isCash).toBe(false);
      }
    });

    it('classifies generic investment accounts as brokerage', () => {
      const c = classifyAccount({ type: 'investment', subtype: 'brokerage', balance: { current: 100 } });
      expect(c.category).toBe('brokerage');
      expect(c.isInvestment).toBe(true);
    });
  });

  describe('debt classification', () => {
    it('classifies credit accounts/subtypes as credit debt', () => {
      expect(classifyAccount({ type: 'credit', subtype: 'credit card', balance: { current: 410 } }).category).toBe('credit');
      expect(classifyAccount({ type: '', subtype: 'credit card', balance: { current: 410 } }).isDebt).toBe(true);
    });

    it('classifies mortgage / home equity as mortgage debt', () => {
      expect(classifyAccount({ type: 'loan', subtype: 'mortgage', balance: { current: 56302 } }).category).toBe('mortgage');
      expect(classifyAccount({ type: 'loan', subtype: 'home equity', balance: { current: 1000 } }).category).toBe('mortgage');
    });

    it('classifies loans with their subtype as the liability key', () => {
      const student = classifyAccount({ type: 'loan', subtype: 'student', balance: { current: 65262 } });
      expect(student.category).toBe('loan');
      expect(student.isDebt).toBe(true);
      expect(student.liabilityKey).toBe('student');

      const generic = classifyAccount({ type: 'loan', subtype: '', balance: { current: 100 } });
      expect(generic.liabilityKey).toBe('loan');
    });
  });

  it('returns unknown for unrecognized accounts', () => {
    expect(classifyAccount({ type: 'other', subtype: 'weird', balance: { current: 1 } }).category).toBe('unknown');
  });
});
