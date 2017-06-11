/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configBlockTemplate = {
  id: exampleLedgerId,
  ledger: exampleLedgerId + '/blocks/1',
  type: 'WebLedgerConfigurationBlock',
  consensusMethod: {
    type: 'Continuity2017'
  },
  configurationAuthorizationMethod: {
    type: 'ProofOfSignature2016',
    approvedSigner: [
      'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
    ],
    minimumSignaturesRequired: 1
  },
  writeAuthorizationMethod: {
    type: 'ProofOfSignature2016',
    approvedSigner: [
      'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
    ],
    minimumSignaturesRequired: 1
  },
  signature: {
    type: 'RsaSignature2017',
    created: '2017-10-24T05:33:31Z',
    creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
    domain: 'example.com',
    signatureValue: 'eyiOiJJ0eXAK...EjXkgFWFO'
  }
};

const eventBlockTemplate = {
  id: '',
  type: 'WebLedgerEventBlock',
  event: [{
    '@context': 'https://w3id.org/webledger/v1',
    id: '',
    type: 'WebLedgerEvent',
    operation: 'Create',
    input: [{
      id: 'https://example.com/events/123456',
      description: 'Example event',
      signature: {
        type: 'RsaSignature2017',
        created: '2017-05-10T19:47:13Z',
        creator: 'http://example.com/keys/123',
        signatureValue: 'gXI7wqa...FMMJoS2Bw=='
      }
    }],
    signature: {
      type: 'RsaSignature2017',
      created: '2017-05-10T19:47:15Z',
      creator: 'http://example.com/keys/789',
      signatureValue: 'JoS27wqa...BFMgXIMw=='
    }
  }],
  previousBlock: '',
  previousBlockHash: '',
  signature: {
    type: 'RsaSignature2017',
    created: '2017-10-24T05:33:31Z',
    creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
    domain: 'example.com',
    signatureValue: 'eyiOiJJ0eXAK...WFOEjXkgF'
  }
};

describe('Block Storage API', () => {
  let ledgerStorage;

  before(done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {};

    blsMongodb.create(configBlock, meta, options, (err, storage) => {
      ledgerStorage = storage;
      done(err);
    });
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should create block', done => {
    let eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    ledgerStorage.blocks.create(eventBlock, meta, options, (err, result) => {
      should.not.exist(err);
      should.exist(result);
      should.exist(result.block);
      should.exist(result.meta);

      // ensure the block was created in the database
      const query = {id: database.hash(eventBlock.id)};
      ledgerStorage.blocks.collection.findOne(query, (err, record) => {
        should.not.exist(err);
        should.exist(record);
        should.exist(record.id);
        should.exist(record.block.id);
        should.exist(record.meta.pending);
        done();
      });
    });
  });
  it('should not create duplicate block', done => {
    let eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    ledgerStorage.blocks.create(eventBlock, meta, options, (err, result) => {
      should.exist(err);
      err.name.should.equal('DuplicateBlockId');
      done();
    });
  });
  it('should get block', done => {
    const blockId = exampleLedgerId + '/blocks/2';
    const options = {};

    // create the block
    ledgerStorage.blocks.get(blockId, options, (err, result) => {
      should.not.exist(err);
      should.exist(result);
      should.exist(result.block);
      should.exist(result.meta);
      result.block.id.should.equal(exampleLedgerId + '/blocks/2');
      done();
    });
  });
  it.skip('should get latest blocks', done => {
    done();
  });
  it.skip('should update block', done => {
    done();
  });
  it.skip('should delete block', done => {
    done();
  });
}); // end createLedger
