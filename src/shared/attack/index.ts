import crypto from 'crypto';

import { LnrpcInvoice } from '../lnd/types';

/**
 * Test-only behaviours for exercising a payer against a hostile receiver on regtest.
 * The username's prefix picks one: `hint-alice@…` answers with a private, route-hinted invoice.
 */
export const ATTACK_MODES = ['skim', 'hint', 'hold', 'over', 'zero', 'expired'] as const;
export type AttackMode = (typeof ATTACK_MODES)[number];

const OVERCHARGE_FACTOR = BigInt(2);
const EXPIRED_INVOICE_SECONDS = '1';

// Off unless asked for: a real deployment must never hand out a hostile invoice.
export const attackModesEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  env.LNADDR_ATTACK_MODES === '1';

export function attackModeFor(username: string, enabled: boolean): AttackMode | null {
  if (!enabled) {
    return null;
  }
  const prefix = username.toLowerCase().split('-')[0];
  return (ATTACK_MODES as readonly string[]).includes(prefix) ? (prefix as AttackMode) : null;
}

export interface InvoiceRequest {
  valueMsat: string;
  descriptionHash: string;
  expiry?: string;
}

export function invoiceArgsFor(mode: AttackMode | null, request: InvoiceRequest): LnrpcInvoice {
  const base: LnrpcInvoice = {
    value_msat: request.valueMsat,
    description_hash: request.descriptionHash,
    ...(request.expiry ? { expiry: request.expiry } : {})
  };

  switch (mode) {
    case 'hint':
      return { ...base, private: true };
    case 'over':
      return { ...base, value_msat: (BigInt(request.valueMsat) * OVERCHARGE_FACTOR).toString() };
    case 'zero': {
      const { value_msat: _omitted, ...rest } = base;
      return rest;
    }
    case 'expired':
      return { ...base, expiry: EXPIRED_INVOICE_SECONDS };
    default:
      return base;
  }
}

/** Preimages of hold invoices this server issued, kept until someone settles or cancels them. */
export class HoldInvoices {
  private preimages = new Map<string, Buffer>();

  create(): { hashHex: string; hashBase64: string } {
    const preimage = crypto.randomBytes(32);
    const hash = crypto.createHash('sha256').update(preimage).digest();
    const hashHex = hash.toString('hex');
    this.preimages.set(hashHex, preimage);
    return { hashHex, hashBase64: hash.toString('base64') };
  }

  pending(): string[] {
    return [...this.preimages.keys()];
  }

  preimageFor(hashHex: string): Buffer | undefined {
    return this.preimages.get(hashHex.toLowerCase());
  }

  forget(hashHex: string) {
    this.preimages.delete(hashHex.toLowerCase());
  }
}

export const holdInvoices = new HoldInvoices();
