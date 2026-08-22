import express from 'express';
import { requireAuth } from './middleware';
import { getPublicEligibility } from '../services/public-api/eligibility';
import { deleteSecret, getStatus, storeSecret } from '../services/public-api/credential-store';
import { mintAccessToken, PublicApiError } from '../services/public-api/client';
import { FinancialRevisionService } from '../services/financial-revision-service';

/**
 * Routes for the direct Public.com integration.
 *
 * A stopgap for SnapTrade's inability to complete an initial holdings sync on
 * Public's managed-yield products. Every route is gated on the user already
 * holding a Public connection through SnapTrade -- enforced here, not merely
 * hidden in the UI -- so this cannot become a general "bring your own brokerage
 * key" surface by way of a crafted request.
 *
 * The stored secret is never returned by any route. `GET /status` reports whether
 * one exists and whether it last worked; nothing reads it back out.
 */

const router = express.Router();

/** Public's secrets are opaque; bound the length so a paste error is caught early. */
const MAX_SECRET_LENGTH = 4096;

/** GET /public-api/status - eligibility and whether a secret is configured. */
router.get('/status', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const [eligibility, status] = await Promise.all([
      getPublicEligibility(userId),
      getStatus(userId),
    ]);
    res.json({
      success: true,
      data: {
        eligible: eligibility.eligible,
        configured: status.configured,
        lastVerifiedAt: status.lastVerifiedAt,
        lastError: status.lastError,
        publicAccountsViaSnapTrade: eligibility.snapTradeAccountIds.length,
      },
    });
  } catch (error) {
    console.error('Public API status failed:', error);
    res.status(500).json({ error: 'Could not read Public API status.' });
  }
});

/**
 * PUT /public-api/secret - store or replace the user's Public personal secret.
 *
 * The secret is verified against Public before it is stored, so a typo fails here
 * rather than silently producing an ingestion pass that finds nothing.
 */
router.put('/secret', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { eligible } = await getPublicEligibility(userId);
    if (!eligible) {
      return res.status(403).json({
        error: 'A direct Public connection is only available for accounts already linked to Public.',
      });
    }

    const secret = typeof req.body?.secret === 'string' ? req.body.secret.trim() : '';
    if (!secret) return res.status(400).json({ error: 'A Public API secret is required.' });
    if (secret.length > MAX_SECRET_LENGTH) {
      return res.status(400).json({ error: 'That does not look like a Public API secret.' });
    }

    // Verify before storing. Minting a token is the cheapest call that proves the
    // secret works, and it avoids persisting a credential that can never be used.
    try {
      await mintAccessToken(secret);
    } catch (error) {
      const rejected = error instanceof PublicApiError && error.credentialRejected;
      return res.status(rejected ? 400 : 502).json({
        error: rejected
          ? 'Public did not accept that secret. Check it was copied in full from your Public settings.'
          : 'Could not reach Public to verify that secret. Try again shortly.',
      });
    }

    await storeSecret(userId, secret);

    // The next snapshot is what actually shows the recovered balances, so queue a
    // rebuild rather than making the user wait for the scheduled one.
    try {
      FinancialRevisionService.schedule(userId, {
        categorize: false,
        history: { kind: 'material', reason: 'public-direct-connected' },
      }, 'Public direct connect');
    } catch {
      // Non-fatal: the credential is stored, and the next scheduled rebuild picks it up.
    }

    res.json({ success: true, message: 'Public connected. Your balances will refresh shortly.' });
  } catch (error) {
    console.error('Public API secret store failed:', error);
    res.status(500).json({ error: 'Could not save that Public API secret.' });
  }
});

/** DELETE /public-api/secret - forget the secret and fall back to SnapTrade. */
router.delete('/secret', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const removed = await deleteSecret(userId);
    if (!removed) return res.status(404).json({ error: 'No Public API secret is configured.' });

    // Removing the secret un-suppresses SnapTrade's Public accounts, so the totals
    // change either way and the snapshot has to be rebuilt.
    try {
      FinancialRevisionService.schedule(userId, {
        categorize: false,
        history: { kind: 'material', reason: 'public-direct-disconnected' },
      }, 'Public direct disconnect');
    } catch {
      // Non-fatal, as above.
    }

    res.json({ success: true, message: 'Public API secret removed.' });
  } catch (error) {
    console.error('Public API secret delete failed:', error);
    res.status(500).json({ error: 'Could not remove that Public API secret.' });
  }
});

/** Mount under `/public-api`, mirroring how the SnapTrade routes register. */
export const setupPublicApiRoutes = (app: express.Application) => {
  app.use('/public-api', router);
};

export default router;
