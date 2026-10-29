import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';

import { HoldInvoices } from '../../shared/attack';
import logger from '../../shared/logger';

export interface HoldControls {
  holdInvoices: HoldInvoices;
  settle: (preimageBase64: string) => Promise<unknown>;
  cancel: (hashBase64: string) => Promise<unknown>;
}

const PAYMENT_HASH = /^[0-9a-f]{64}$/i;

function tokenMatches(given: unknown, expected: string) {
  if (typeof given !== 'string' || given.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export function createAttackRouter(token: string, controls: HoldControls) {
  const router = express.Router();

  router.use((req: Request, res: Response, next: NextFunction): void => {
    if (!tokenMatches(req.get('x-attack-token'), token)) {
      res.status(401).json({ status: 'ERROR', reason: 'Unauthorized' });
      return;
    }
    next();
  });

  router.get('/hold', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'OK', pending: controls.holdInvoices.pending() });
  });

  const resolve =
    (action: 'settle' | 'cancel') =>
    (req: Request, res: Response): void => {
      const hash = req.params.hash;
      if (!PAYMENT_HASH.test(hash)) {
        res.status(400).json({ status: 'ERROR', reason: 'Invalid payment hash' });
        return;
      }
      const preimage = controls.holdInvoices.preimageFor(hash);
      if (!preimage) {
        res.status(404).json({ status: 'ERROR', reason: 'Unknown hold invoice' });
        return;
      }

      const call =
        action === 'settle'
          ? controls.settle(preimage.toString('base64'))
          : controls.cancel(Buffer.from(hash, 'hex').toString('base64'));
      call
        .then(() => {
          controls.holdInvoices.forget(hash);
          logger.warn(`Hold invoice ${action}d`, { hash });
          res.status(200).json({ status: 'OK' });
        })
        .catch((error) => {
          logger.error(`Hold invoice ${action} failed`, error);
          res.status(502).json({ status: 'ERROR', reason: `Could not ${action} the invoice` });
        });
    };

  router.post('/hold/:hash/settle', resolve('settle'));
  router.post('/hold/:hash/cancel', resolve('cancel'));

  return router;
}
