/*!
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {util: {uuid}} = bedrock;

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Ledger Storage Driver API', () => {
  let ledgerStorage;

  before(done => {
    const block = bedrock.util.clone(configBlockTemplate);
    const meta = {};
    const options = {
      ledgerId: exampleLedgerId, ledgerNodeId: exampleLedgerNodeId
    };
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
          blockHeight: 0,
          blockOrder: 0,
          consensus: true,
          consensusDate: Date.now(),
          eventHash: results.eventHash
        };
        ledgerStorage.events.add({event: configEventTemplate, meta}, callback);
      }],
      addConfigBlock: ['addEvent', 'blockHash', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
        meta.blockHash = results.blockHash;
        meta.consensus = Date.now();
        block.blockHeight = 0;
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
