import { LnrpcAddInvoiceResponse, LnrpcInvoice } from '../lnd/types';

export interface Lud21CallbackResponse {
  status: 'OK';
  successAction: { tag: 'message'; message: string };
  routes: [];
  pr: string;
  verify: string;
  disposable: false;
}

export interface Lud21VerifyResponse {
  status: 'OK';
  settled: boolean;
  preimage: string | null;
  pr: string;
}

/** LND REST returns byte fields as base64; LUD-21 wants hex. */
export function lndBytesToHex(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return Buffer.from(value, 'base64').toString('hex');
}

export function buildVerifyUrl(domain: string, username: string, paymentHashHex: string): string {
  return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(username)}/verify/${paymentHashHex}`;
}

export function toCallbackResponse(
  invoice: LnrpcAddInvoiceResponse,
  domain: string,
  username: string
): Lud21CallbackResponse {
  const paymentHashHex = lndBytesToHex(invoice.r_hash);
  if (!paymentHashHex) {
    throw new Error('LND returned an invoice without a payment hash.');
  }

  return {
    status: 'OK',
    successAction: { tag: 'message', message: 'Thank You!' },
    routes: [],
    pr: invoice.payment_request ?? '',
    verify: buildVerifyUrl(domain, username, paymentHashHex),
    disposable: false
  };
}

export function toVerifyResponse(invoice: LnrpcInvoice): Lud21VerifyResponse {
  const settled = invoice.settled === true || invoice.state === 'SETTLED';

  return {
    status: 'OK',
    settled,
    // Unsettled invoices carry an all-zero placeholder preimage; LUD-21 wants null.
    preimage: settled ? (lndBytesToHex(invoice.r_preimage) ?? null) : null,
    pr: invoice.payment_request ?? ''
  };
}
