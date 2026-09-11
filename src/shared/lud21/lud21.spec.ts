import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InvoiceInvoiceState } from '../lnd/types';
import { buildVerifyUrl, lndBytesToHex, toCallbackResponse, toVerifyResponse } from './index';

// Real hash from an ln.regtest.coinsnap.org invoice, in both encodings LND emits.
const HASH_HEX = '4e4c7d2ad29099061dd3d31064c8a2dd706a9fa80d1a3e903f1be41c445107e5';
const HASH_B64 = 'Tkx9KtKQmQYd09MQZMii3XBqn6gNGj6QPxvkHERRB+U=';
const HASH_B64URL = 'Tkx9KtKQmQYd09MQZMii3XBqn6gNGj6QPxvkHERRB-U=';

describe('lndBytesToHex', () => {
  it('converts a standard base64 payment hash to hex', () => {
    assert.equal(lndBytesToHex(HASH_B64), HASH_HEX);
  });

  it('converts a url-safe base64 payment hash to hex', () => {
    assert.equal(lndBytesToHex(HASH_B64URL), HASH_HEX);
  });

  it('returns undefined when the field is absent', () => {
    assert.equal(lndBytesToHex(undefined), undefined);
  });
});

const PREIMAGE_HEX = '2f1c5a9e4b8d0376c1e2a4f6b8d0123456789abcdef0123456789abcdef01234';
const PREIMAGE_B64 = Buffer.from(PREIMAGE_HEX, 'hex').toString('base64');
const ZERO_PREIMAGE_B64 = Buffer.alloc(32).toString('base64');
const BOLT11 = 'lnbcrt10n1p428cq5pp5q28j0m6e02q8x706nxhr7jhwzuqhaerlp2fwwjjkcakxzdlkej7s';

describe('toVerifyResponse', () => {
  it('reports a settled invoice with its preimage in hex', () => {
    const body = toVerifyResponse({
      settled: true,
      state: InvoiceInvoiceState.SETTLED,
      r_preimage: PREIMAGE_B64,
      payment_request: BOLT11
    });

    assert.deepEqual(body, {
      status: 'OK',
      settled: true,
      preimage: PREIMAGE_HEX,
      pr: BOLT11
    });
  });

  it('reports an unsettled invoice as not settled', () => {
    const body = toVerifyResponse({
      settled: false,
      state: InvoiceInvoiceState.OPEN,
      r_preimage: ZERO_PREIMAGE_B64,
      payment_request: BOLT11
    });

    assert.equal(body.settled, false);
    assert.equal(body.pr, BOLT11);
  });

  it('never leaks the all-zero placeholder preimage of an unsettled invoice', () => {
    const body = toVerifyResponse({
      settled: false,
      state: InvoiceInvoiceState.OPEN,
      r_preimage: ZERO_PREIMAGE_B64,
      payment_request: BOLT11
    });

    assert.equal(body.preimage, null);
  });

  it('treats a SETTLED state as settled even when the boolean is absent', () => {
    const body = toVerifyResponse({
      state: InvoiceInvoiceState.SETTLED,
      r_preimage: PREIMAGE_B64,
      payment_request: BOLT11
    });

    assert.equal(body.settled, true);
    assert.equal(body.preimage, PREIMAGE_HEX);
  });
});

describe('buildVerifyUrl', () => {
  it('builds an https verify URL on the default port', () => {
    const url = buildVerifyUrl('ln.regtest.coinsnap.org', 'test', HASH_HEX);

    assert.equal(url, `https://ln.regtest.coinsnap.org/.well-known/lnurlp/test/verify/${HASH_HEX}`);
  });

  it('encodes a username so it cannot escape the path', () => {
    const url = buildVerifyUrl('ln.regtest.coinsnap.org', 'a/../b', HASH_HEX);

    assert.equal(new URL(url).pathname, `/.well-known/lnurlp/a%2F..%2Fb/verify/${HASH_HEX}`);
  });
});

describe('toCallbackResponse', () => {
  it('advertises a verify URL derived from the invoice payment hash', () => {
    const body = toCallbackResponse(
      { r_hash: HASH_B64, payment_request: BOLT11 },
      'ln.regtest.coinsnap.org',
      'test'
    );

    assert.equal(body.pr, BOLT11);
    assert.equal(
      body.verify,
      `https://ln.regtest.coinsnap.org/.well-known/lnurlp/test/verify/${HASH_HEX}`
    );
  });

  it('keeps the fields existing wallets already rely on', () => {
    const body = toCallbackResponse(
      { r_hash: HASH_B64, payment_request: BOLT11 },
      'ln.regtest.coinsnap.org',
      'test'
    );

    assert.equal(body.status, 'OK');
    assert.deepEqual(body.routes, []);
    assert.equal(body.disposable, false);
    assert.deepEqual(body.successAction, { tag: 'message', message: 'Thank You!' });
  });

  it('refuses to build a response when the node returned no payment hash', () => {
    assert.throws(
      () => toCallbackResponse({ payment_request: BOLT11 }, 'ln.regtest.coinsnap.org', 'test'),
      /payment hash/i
    );
  });
});
