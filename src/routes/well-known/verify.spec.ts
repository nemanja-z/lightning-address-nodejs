import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import express from 'express';

import { InvoiceInvoiceState, LnrpcInvoice } from '../../shared/lnd/types';
import { InvoiceLookup, createVerifyRouter } from './verify';

const HASH_HEX = '4e4c7d2ad29099061dd3d31064c8a2dd706a9fa80d1a3e903f1be41c445107e5';
const PREIMAGE_HEX = '2f1c5a9e4b8d0376c1e2a4f6b8d0123456789abcdef0123456789abcdef01234';
const BOLT11 = 'lnbcrt10n1p428cq5pp5q28j0m6e02q8x706nxhr7jhwzuqhaerlp2fwwjjkcakxzdlkej7s';

const settledInvoice: LnrpcInvoice = {
  settled: true,
  state: InvoiceInvoiceState.SETTLED,
  r_preimage: Buffer.from(PREIMAGE_HEX, 'hex').toString('base64'),
  payment_request: BOLT11
};

const openInvoice: LnrpcInvoice = {
  settled: false,
  state: InvoiceInvoiceState.OPEN,
  r_preimage: Buffer.alloc(32).toString('base64'),
  payment_request: BOLT11
};

/** Serves the router on an ephemeral port and returns the parsed body of one GET. */
function serve(lookup: InvoiceLookup) {
  const app = express();
  app.use('/.well-known', createVerifyRouter(lookup));
  const server: Server = app.listen(0);

  const get = async (path: string) => {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  return { server, get };
}

describe('GET /.well-known/lnurlp/:username/verify/:hash', () => {
  let ctx: ReturnType<typeof serve>;
  const lookups: string[] = [];

  before(() => {
    ctx = serve(async (hash: string) => {
      lookups.push(hash);
      if (hash === HASH_HEX) return settledInvoice;
      if (hash === 'b'.repeat(64)) return openInvoice;
      return null;
    });
  });

  after(() => ctx.server.close());

  it('returns the preimage for a settled invoice', async () => {
    const { status, body } = await ctx.get(`/.well-known/lnurlp/test/verify/${HASH_HEX}`);

    assert.equal(status, 200);
    assert.deepEqual(body, {
      status: 'OK',
      settled: true,
      preimage: PREIMAGE_HEX,
      pr: BOLT11
    });
  });

  it('reports an unpaid invoice as unsettled', async () => {
    const { body } = await ctx.get(`/.well-known/lnurlp/test/verify/${'b'.repeat(64)}`);

    assert.equal(body.settled, false);
    assert.equal(body.preimage, null);
  });

  it('returns an LNURL Not found error for an unknown payment hash', async () => {
    const { body } = await ctx.get(`/.well-known/lnurlp/test/verify/${'c'.repeat(64)}`);

    assert.deepEqual(body, { status: 'ERROR', reason: 'Not found' });
  });

  it('rejects a malformed payment hash without querying the node', async () => {
    lookups.length = 0;

    const { body } = await ctx.get('/.well-known/lnurlp/test/verify/not-a-hash');

    assert.equal(body.status, 'ERROR');
    assert.deepEqual(lookups, []);
  });
});
