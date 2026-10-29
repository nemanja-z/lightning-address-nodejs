import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import { afterEach, describe, it } from 'node:test';
import express from 'express';

import { HoldInvoices } from '../../shared/attack';
import { HoldControls, createAttackRouter } from '.';

const TOKEN = 'regtest-only';

let server: Server | undefined;

afterEach(() => server?.close());

function serve(overrides: Partial<HoldControls> = {}) {
  const calls: string[] = [];
  const controls: HoldControls = {
    holdInvoices: new HoldInvoices(),
    settle: async (preimage) => calls.push(`settle:${preimage}`),
    cancel: async (hash) => calls.push(`cancel:${hash}`),
    ...overrides
  };
  const app = express();
  app.use('/attack', createAttackRouter(TOKEN, controls));
  server = app.listen(0);

  const request = async (method: string, path: string, token: string | null = TOKEN) => {
    const { port } = server!.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: token ? { 'x-attack-token': token } : {}
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  return { controls, calls, request };
}

describe('attack router', () => {
  it('refuses a request without the token', async () => {
    const { request } = serve();

    assert.equal((await request('GET', '/attack/hold', null)).status, 401);
    assert.equal((await request('GET', '/attack/hold', 'wrong-token!')).status, 401);
  });

  it('lists pending hold invoices', async () => {
    const { controls, request } = serve();
    const { hashHex } = controls.holdInvoices.create();

    const { body } = await request('GET', '/attack/hold');
    assert.deepEqual(body.pending, [hashHex]);
  });

  it('settles with the stored preimage and forgets it', async () => {
    const { controls, calls, request } = serve();
    const { hashHex } = controls.holdInvoices.create();
    const preimage = controls.holdInvoices.preimageFor(hashHex)!.toString('base64');

    assert.equal((await request('POST', `/attack/hold/${hashHex}/settle`)).status, 200);
    assert.deepEqual(calls, [`settle:${preimage}`]);
    assert.deepEqual(controls.holdInvoices.pending(), []);
  });

  it('cancels by payment hash', async () => {
    const { controls, calls, request } = serve();
    const { hashHex, hashBase64 } = controls.holdInvoices.create();

    assert.equal((await request('POST', `/attack/hold/${hashHex}/cancel`)).status, 200);
    assert.deepEqual(calls, [`cancel:${hashBase64}`]);
  });

  it('rejects an unknown or malformed hash', async () => {
    const { request } = serve();

    assert.equal((await request('POST', `/attack/hold/${'a'.repeat(64)}/settle`)).status, 404);
    assert.equal((await request('POST', '/attack/hold/nothex/settle')).status, 400);
  });

  it('keeps the preimage when LND refuses to settle', async () => {
    const { controls, request } = serve({
      settle: async () => {
        throw new Error('invoice still open');
      }
    });
    const { hashHex } = controls.holdInvoices.create();

    assert.equal((await request('POST', `/attack/hold/${hashHex}/settle`)).status, 502);
    assert.deepEqual(controls.holdInvoices.pending(), [hashHex]);
  });
});
