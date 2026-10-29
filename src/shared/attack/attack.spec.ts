import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

import { HoldInvoices, attackModeFor, attackModesEnabled, invoiceArgsFor } from '.';

const REQUEST = { valueMsat: '21000', descriptionHash: 'aGFzaA==', expiry: '600' };

describe('attackModesEnabled', () => {
  it('is on only for LNADDR_ATTACK_MODES=1', () => {
    assert.equal(attackModesEnabled({ LNADDR_ATTACK_MODES: '1' }), true);
    assert.equal(attackModesEnabled({ LNADDR_ATTACK_MODES: 'true' }), false);
    assert.equal(attackModesEnabled({}), false);
  });
});

describe('attackModeFor', () => {
  it('reads the mode from the username prefix', () => {
    assert.equal(attackModeFor('hold-alice', true), 'hold');
    assert.equal(attackModeFor('HINT-bob', true), 'hint');
    assert.equal(attackModeFor('expired', true), 'expired');
  });

  it('treats other usernames as ordinary', () => {
    assert.equal(attackModeFor('alice', true), null);
    assert.equal(attackModeFor('holder-alice', true), null);
  });

  it('never applies a mode while attack modes are off', () => {
    assert.equal(attackModeFor('hold-alice', false), null);
  });
});

describe('invoiceArgsFor', () => {
  it('passes an ordinary or skim request through', () => {
    const plain = { value_msat: '21000', description_hash: 'aGFzaA==', expiry: '600' };
    assert.deepEqual(invoiceArgsFor(null, REQUEST), plain);
    assert.deepEqual(invoiceArgsFor('skim', REQUEST), plain);
  });

  it('marks a hint invoice private so it carries route hints', () => {
    assert.equal(invoiceArgsFor('hint', REQUEST).private, true);
  });

  it('asks for twice the requested amount', () => {
    assert.equal(invoiceArgsFor('over', REQUEST).value_msat, '42000');
  });

  it('leaves the amount out of a zero invoice', () => {
    assert.equal('value_msat' in invoiceArgsFor('zero', REQUEST), false);
  });

  it('expires an expired invoice after one second, whatever was requested', () => {
    assert.equal(invoiceArgsFor('expired', REQUEST).expiry, '1');
  });
});

describe('HoldInvoices', () => {
  it('keeps the preimage of each issued hash until forgotten', () => {
    const holds = new HoldInvoices();
    const { hashHex, hashBase64 } = holds.create();

    const preimage = holds.preimageFor(hashHex.toUpperCase());
    assert.ok(preimage);
    assert.equal(crypto.createHash('sha256').update(preimage).digest('base64'), hashBase64);
    assert.deepEqual(holds.pending(), [hashHex]);

    holds.forget(hashHex);
    assert.equal(holds.preimageFor(hashHex), undefined);
  });
});
