import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { lightningApi } from '../../shared/lnd/api';
import { toCallbackResponse } from '../../shared/lud21';
import logger from '../../shared/logger';
import { createVerifyRouter } from './verify';

const DOMAIN = process.env.LNADDR_DOMAIN;
const router = express.Router();

if (!DOMAIN) {
  throw new Error('Missing LNADDR_DOMAIN env variable');
}

router.use(createVerifyRouter((hash) => lightningApi.lightningLookupInvoice(hash)));

router.get('/lnurlp/:username', (req: Request, res: Response, next: NextFunction) => {
  const handleRequest = async () => {
    const username = req.params.username;
    logger.info('Lightning Address Request', req.params);

    if (!username) {
      return res.status(404).send('Username not found');
    }

    const identifier = `https://${DOMAIN}/.well-known/lnurlp/${username}`;
    const metadata = [
      ['text/identifier', identifier],
      ['text/plain', `Sats for ${username}!`]
    ];

    if (req.query.amount) {
      const msat = req.query.amount;
      // Honour the caller's expiry, so a BOLT11 does not outlive the order it pays for.
      let expiry: string | undefined;
      if (req.query.expiry !== undefined) {
        const seconds = Number(req.query.expiry);
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 30 * 24 * 3600) {
          return res.status(200).json({ status: 'ERROR', reason: 'Invalid expiry' });
        }
        expiry = String(seconds);
      }
      try {
        logger.debug('Generating LND Invoice');
        const invoice = await lightningApi.lightningAddInvoice({
          value_msat: msat as string,
          description_hash: crypto
            .createHash('sha256')
            .update(JSON.stringify(metadata))
            .digest('base64'),
          ...(expiry ? { expiry } : {})
        });
        logger.debug('LND Invoice', invoice);
        lightningApi.sendWebhookNotification(invoice);
        return res.status(200).json(toCallbackResponse(invoice, DOMAIN, username));
      } catch (error) {
        if (error instanceof Error) {
          logger.error(`Error creating Invoice. Reason ---> ${error.message}`, error);
          return res.status(500).json({ status: 'ERROR', reason: 'Error generating invoice' });
        } else {
          logger.error(`Unexpected error: ${error}`, error);
          return res.status(500).json({ status: 'ERROR', reason: 'Unexpected error occurred' });
        }
      }
    }

    logger.info('Response', {
      status: 'OK',
      callback: identifier,
      tag: 'payRequest',
      maxSendable: 250000000,
      minSendable: 1000,
      metadata: JSON.stringify(metadata),
      commentsAllowed: 0
    });
    // No amount present, send callback identifier
    return res.status(200).json({
      status: 'OK',
      callback: identifier,
      tag: 'payRequest',
      maxSendable: 250000000,
      minSendable: 1000,
      metadata: JSON.stringify(metadata),
      commentsAllowed: 0
    });
  };

  handleRequest().catch(next);
});

export { router as wellknown };
