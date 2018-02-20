/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configEventTemplate = _.cloneDeep(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = _.cloneDeep(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Ledger Storage Driver API', () => {
  let ledgerStorage;

  before(done => {
    const block = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {ledgerId: exampleLedgerId};

    async.auto({
      initStorage: callback => blsMongodb.add(
        meta, options, (err, storage) => {
          ledgerStorage = storage;
          callback(err, storage);
        }),
      blockHash: callback => helpers.testHasher(block, callback),
      eventHash: callback => helpers.testHasher(configEventTemplate, callback),
      addEvent: ['initStorage', 'eventHash', (results, callback) => {
        const meta = {
          consensus: true,
          consensusDate: Date.now(),
          eventHash: results.eventHash
        };
        ledgerStorage.events.add(configEventTemplate, meta, callback);
      }],
      addConfigBlock: [
        'initStorage', 'blockHash', 'eventHash', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
          meta.blockHash = results.blockHash;
          meta.consensus = Date.now();
          block.event = [results.eventHash];
          ledgerStorage.blocks.add({block, meta}, callback);
        }]
    }, done);
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should be able to retrieve the driver', done => {
    should.exist(ledgerStorage.driver);
    done();
  });
  it('should be able to perform a query', done => {
    const query = {
      'ledger.id': ledgerStorage.id
    };
    ledgerStorage.driver.collections.ledger.findOne(query, (err, result) => {
      assertNoError(err);
      result.ledger.id.should.equal(ledgerStorage.id);
      done();
    });
  });
  it('should be able to perform a write', done => {
    const filter = {
      'ledger.id': ledgerStorage.id
    };
    const update = {
      $set: {
        meta: {
          test: true
        }
      }
    };
    const lc = ledgerStorage.driver.collections.ledger;
    lc.updateOne(filter, update, (err, result) => {
      assertNoError(err);
      result.matchedCount.should.equal(1);
      done();
    });
  });
});
