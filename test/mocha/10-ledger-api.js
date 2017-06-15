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

const configBlockTemplate = mockData.configBlocks.alpha;

describe('Ledger Storage API', () => {
  it('should create a ledger', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta = {};
    const options = {
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
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
  it('should get ledger', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta = {};
    const options = {
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
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
    const meta = {};
    const options = {
      owner: testOwner,
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
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
    const options = {
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.get(ledgerId, options, (err, storage) => {
      should.exist(err);
      should.not.exist(storage);
      err.name.should.equal('LedgerDoesNotExist');
      done();
    });
  });
  it.skip('should iterate over ledgers', done => {
    let ledgerCount = 3;
    const ledgerIds = Array(3).fill().map((e, i) => {
      return 'did:v1:' + uuid.v4();
    });
    async.every(ledgerIds, (ledgerId, callback) => {
      const configBlock = _.cloneDeep(configBlockTemplate);
      configBlock.ledger = ledgerId;
      configBlock.id = ledgerId + '/blocks/1';
      const meta = {};
      const options = {
        owner: testOwner + '-iterator',
        eventHasher: helpers.testHasher,
        blockHasher: helpers.testHasher
      };
      blsMongodb.add(configBlock, meta, options, (err, storage) => {
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
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta = {};
    const options = {
      owner: testOwner,
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
      // ensure that there is no error
      should.not.exist(err);

      blsMongodb.delete(configBlock.ledger, options, err => {
        should.not.exist(err);
        done();
      });
    });
  });
  it.skip('should not delete ledger with owner (if not specified)', done => {
    let configBlock = _.cloneDeep(configBlockTemplate);
    configBlock.ledger = 'did:v1:' + uuid.v4();
    configBlock.id = configBlock.ledger + '/blocks/1';
    const meta = {};
    const options = {
      owner: testOwner,
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
      // ensure that there is no error
      should.not.exist(err);

      const wrongOptions = {};
      blsMongodb.delete(configBlock.ledger, wrongOptions, err => {
        should.exist(err);
        err.name.should.equal('LedgerDeleteFailed');
        done();
      });
    });
  });
});
