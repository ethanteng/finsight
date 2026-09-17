/**
 * The search behind the accounts page's single "Add an account" button.
 *
 * Authenticated: every call spends Plaid and SnapTrade quota, and the results
 * are only useful to someone who is about to connect something.
 */

import express from 'express';
import { requireAuth } from '../auth/middleware';
import { plaidClient } from '../plaid';
import { snapTradeService } from '../snaptrade';
import { createFixedWindowRateLimit, positiveIntFromEnv } from './fixed-window-rate-limit';
import {
  MIN_QUERY_LENGTH,
  PLAID_SEARCH_COUNTRIES,
  PLAID_SEARCH_PRODUCTS,
  cachedBrokerages,
  searchInstitutions,
  type InstitutionDirectoryDeps,
} from '../services/institution-directory';

const router = express.Router();

/** A picker types; a script hammers. 60/min is generous for the former. */
const searchRateLimit = createFixedWindowRateLimit({
  limit: positiveIntFromEnv('INSTITUTION_SEARCH_RATE_LIMIT', 60),
  trustedHops: positiveIntFromEnv('TRUSTED_PROXY_HOPS', 1),
  message: 'Too many institution searches. Please wait a moment and try again.',
});

/** Long enough for any real institution name; anything past it is not a search. */
const MAX_QUERY_LENGTH = 100;

const providerDeps: InstitutionDirectoryDeps = {
  searchPlaidInstitutions: async (query: string) => {
    const response = await plaidClient.institutionsSearch({
      query,
      products: PLAID_SEARCH_PRODUCTS,
      country_codes: PLAID_SEARCH_COUNTRIES,
      options: { include_optional_metadata: true },
    });
    return response.data.institutions || [];
  },
  listSnapTradeBrokerages: () => cachedBrokerages(() => snapTradeService.listBrokerages()),
};

// GET /api/institutions/search?query=... - Institutions either provider can connect
router.get('/search', requireAuth, searchRateLimit, async (req, res) => {
  try {
    const raw = req.query.query;
    const query = (typeof raw === 'string' ? raw : '').slice(0, MAX_QUERY_LENGTH);

    if (query.trim().length < MIN_QUERY_LENGTH) {
      // Not an error: the field is simply too short to search on yet, and the
      // client renders the empty list as a prompt rather than "no results".
      return res.json({ institutions: [], degradedProviders: [], query });
    }

    const result = await searchInstitutions(query, providerDeps);
    res.json({ ...result, query });
  } catch (error) {
    console.error('Institution search failed:', error);
    res.status(500).json({ error: 'Failed to search institutions' });
  }
});

export default router;
