/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const brIdentity = require('bedrock-identity');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const expect = global.chai.expect;
const helpers = require('./helpers');
const jsigs = require('jsonld-signatures');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const baseUri = 'http://example.com';

// use local JSON-LD processor for signatures
jsigs.use('jsonld', bedrock.jsonld);

const configBlockTemplate = {
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


describe('Ledger API', () => {
  before(done => {
    helpers.prepareDatabase(mockData, done);
  });
  beforeEach(done => {
    helpers.removeCollection('ledger_testLedger', done);
  });
  describe('regularUser as actor', () => {
    const mockIdentity = mockData.identities.regularUser;
    let actor;
    before(done => {
      brIdentity.get(null, mockIdentity.identity.id, (err, result) => {
        actor = result;
        done(err);
      });
    });
    it('should create a ledger', done => {
      let configBlock = _.cloneDeep(configBlockTemplate);
      configBlock.ledger = 'did:v1:' + uuid.v4();
      configBlock.id = configBlock.ledger + '/blocks/1';
      const meta = {};
      const options = {};

      blsMongodb.create(configBlock, meta, options, (err, storage) => {
        // ensure ledger storage API exists
        should.not.exist(err);
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);

        // ensure the ledger was created in the database
        const query = {id: database.hash(configBlock.ledger)};
        database.collections.ledger.findOne(query, (err, record) => {
          should.not.exist(err);
          should.exist(record);
          should.exist(record.ledger.id);
          should.exist(record.ledger.eventCollection);
          should.exist(record.ledger.blockCollection);
          done();
        });
      });
    });
    it.skip('should get their ledger', done => {
      done();
    });
    it.skip('should iterate over their ledgers', done => {
      done();
    });
    it.skip('should delete their ledger', done => {
      done();
    });
    it.skip('should not delete non-owned ledger', done => {
      done();
    });
    it.skip('should not iterate over non-owned ledgers', done => {
      done();
    });
  });
  describe('admin as actor', () => {
    const mockIdentity = mockData.identities.regularUser;
    let actor;
    before(done => {
      brIdentity.get(null, mockIdentity.identity.id, (err, result) => {
        actor = result;
        done(err);
      });
    });
    it.skip('should create a ledger for any actor', done => {
      done();
    });
    it.skip('should get any ledger', done => {
      done();
    });
    it.skip('should iterate over all ledgers', done => {
      done();
    });
    it.skip('should delete any ledger', done => {
      done();
    });
  });
}); // end createLedger
