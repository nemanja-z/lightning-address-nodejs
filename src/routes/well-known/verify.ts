import express, { NextFunction, Request, Response } from 'express';

import { LnrpcInvoice } from '../../shared/lnd/types';
import { toVerifyResponse } from '../../shared/lud21';
import logger from '../../shared/logger';

/** Resolves a payment hash to an invoice, or null when the node has never seen it. */
export type InvoiceLookup = (paymentHashHex: string) => Promise<LnrpcInvoice | null>;

const PAYMENT_HASH = /^[0-9a-f]{64}$/i;

export function createVerifyRouter(lookupInvoice: InvoiceLookup) {
  const router = express.Router();

  router.get(
    '/lnurlp/:username/verify/:hash',
    (req: Request, res: Response, next: NextFunction) => {
      const handleRequest = async () => {
        const hash = req.params.hash;

        // LNURL errors travel as HTTP 200 with an ERROR body; a client that sees a failure
        // status never reads the reason and retries instead.
        if (!PAYMENT_HASH.test(hash)) {
          return res.status(200).json({ status: 'ERROR', reason: 'Invalid payment hash' });
        }

        const invoice = await lookupInvoice(hash.toLowerCase());
        if (!invoice) {
          return res.status(200).json({ status: 'ERROR', reason: 'Not found' });
        }

        return res.status(200).json(toVerifyResponse(invoice));
      };

      handleRequest().catch((error) => {
        logger.error('LUD-21 verification failed', error);
        res.status(500).json({ status: 'ERROR', reason: 'Verification unavailable' });
      });
    }
  );

  return router;
}
