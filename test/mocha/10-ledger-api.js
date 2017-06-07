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
const testOwner = 'https://example.com/i/testOwner';

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
  it('should create a ledger with owner', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta = {};
    const options = {
      owner: testOwner
    };

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
        should.exist(record.ledger.owner);
        record.ledger.owner.should.equal(testOwner);
        should.exist(record.ledger.eventCollection);
        should.exist(record.ledger.blockCollection);
        done();
      });
    });
  });
  it('should get ledger', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta= {};
    const options = {};

    blsMongodb.create(configBlock, meta, options, (err, storage) => {
      // ensure that there is no error
      should.not.exist(err);

      blsMongodb.get(configBlock.ledger, options, (err, storage) => {
        should.not.exist(err);
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);
        done();
      });
    });
  });
  it('should get ledger with owner', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta= {};
    const options = {
      owner: testOwner
    };

    blsMongodb.create(configBlock, meta, options, (err, storage) => {
      // ensure that there is no error
      should.not.exist(err);

      blsMongodb.get(configBlock.ledger, options, (err, storage) => {
        should.not.exist(err);
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);
        done();
      });
    });
  });
  it('should not get non-existent ledger', done => {
    const ledgerId = 'did:v1:' + uuid.v4();
    const options = {};

    blsMongodb.get(ledgerId, options, (err, storage) => {
      should.exist(err);
      should.not.exist(storage);
      err.name.should.equal('LedgerDoesNotExist');
      done();
    });
  });
  it('should iterate over ledgers', done => {
    let ledgerCount = 3;
    const ledgerIds = Array(3).fill().map((e, i) => {
      return 'did:v1:' + uuid.v4();
    });
    async.every(ledgerIds, (ledgerId, callback) => {
      const configBlock = _.cloneDeep(configBlockTemplate);
      configBlock.ledger = ledgerId
      configBlock.id = ledgerId + '/blocks/1';
      const meta= {};
      const options = {
        owner: testOwner + '-iterator'
      };
      blsMongodb.create(configBlock, meta, options, (err, storage) => {
        callback(err, true);
      });
    }, (err, result) => {
      should.not.exist(err);

      // iterate through all of the ledger IDs
      const options = {owner: testOwner + '-iterator'};
      blsMongodb.getLedgerIterator(options, (err, iterator) => {
        should.not.exist(err);
        ledgerCount = 0;
        async.eachSeries(iterator, (promise, callback) => {
          promise.then(ledgerId => {
            if(ledgerIds.indexOf(ledgerId) === -1) {
              throw new Error('Invalid ledgerId found: ' + ledgerId);
            }
            ledgerCount++;
            callback();
          }, callback);
        }, err => {
          ledgerCount.should.equal(3);
          done(err);
        });
      });
    });
  });
  it.skip('should delete ledger', done => {
    done();
  });
  it.skip('should not delete non-owned ledger', done => {
    done();
  });
  it.skip('should not iterate over non-owned ledgers', done => {
    done();
  });
}); // end createLedger
