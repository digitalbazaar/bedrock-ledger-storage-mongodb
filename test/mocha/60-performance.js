/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

let ledgerStorage;
describe('Performance tests', () => {
  before(done => {
    const block = bedrock.util.clone(configBlockTemplate);
    const meta = {};
    const options = {
      ledgerId: exampleLedgerId, ledgerNodeId: exampleLedgerNodeId
    };
    async.auto({
      initStorage: callback => blsMongodb.add(meta, options, (err, storage) => {
        ledgerStorage = storage;
        callback(err, storage);
      }),
      eventHash: callback => helpers.testHasher(configEventTemplate, callback),
      blockHash: callback => helpers.testHasher(block, callback),
      addEvent: ['initStorage', 'eventHash', (results, callback) => {
        const meta = {
          blockHeight: 0,
          blockOrder: 0,
          consensus: true,
          consensusDate: Date.now(),
          eventHash: results.eventHash,
          validConfiguration: true
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

  describe('Blocks and Event Operations', () => {
    const blockNum = 1000;
    const eventNum = 10;
    const opNum = 2500;
    const passNum = 10;
    const outstandingEventNum = 250;
    let blocksAndEvents;
    it(`generating ${blockNum} blocks`, function(done) {
      this.timeout(320000);
      helpers.createBlocks({
        blockNum,
        blockTemplate: mockData.eventBlocks.alpha,
        eventNum,
        eventTemplate: mockData.events.alpha,
        opTemplate: mockData.operations.alpha
      }, (err, result) => {
        assertNoError(err);
        blocksAndEvents = result;
        done();
      });
    });

    it(`operations.add operations`, function(done) {
      this.timeout(320000);
      const {operations} = blocksAndEvents;
      console.log(`Adding ${operations.length} operations.`);
      ledgerStorage.operations.addMany({operations}, err => {
        assertNoError(err);
        done();
      });
    });

    // NOTE: the events added here are referenced in the blocks.add test
    it(`events.add events`, function(done) {
      this.timeout(320000);
      console.log(`Adding ${blocksAndEvents.events.length} events.`);
      async.eachLimit(blocksAndEvents.events, 100, (e, callback) =>
        ledgerStorage.events.add({event: e.event, meta: e.meta}, err => {
          assertNoError(err);
          callback();
        }), err => {
        assertNoError(err);
        done();
      });
    });

    // NOTE: the events referenced in the blocks are stored in events.add
    it(`blocks.add ${blockNum} blocks`, function(done) {
      this.timeout(320000);
      async.eachLimit(
        blocksAndEvents.blocks, 100, ({block, meta}, callback) => {
          ledgerStorage.blocks.add({block, meta}, err => {
            assertNoError(err);
            callback();
          });
        }, done);
    });
    it(`add ${outstandingEventNum} events without consensus`, function(done) {
      this.timeout(320000);
      async.auto({
        create: callback => helpers.createEvent({
          consensus: false,
          eventNum: outstandingEventNum,
          eventTemplate: mockData.events.alpha,
          opTemplate: mockData.operations.alpha,
        }, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        add: ['operations', (results, callback) =>
          async.eachLimit(results.create.events, 100, (e, callback) =>
            ledgerStorage.events.add({event: e.event, meta: e.meta}, err => {
              assertNoError(err);
              callback();
            }), callback)]
      }, done);
    });
    it(`blocks.getLatestSummary ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: ledgerStorage.blocks.getLatestSummary, api: 'blocks',
        passNum, opNum
      }, done);
    });
    it(`blocks.getLatest ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: ledgerStorage.blocks.getLatest, api: 'blocks', passNum, opNum
      }, done);
    });
    it(`events.getLatestConfig ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: ledgerStorage.events.getLatestConfig, api: 'events',
        passNum, opNum
      }, done);
    });
  });
});

function runPasses({func, passNum, opNum, api, concurrency = 100}, callback) {
  const passes = [];
  async.timesSeries(passNum, (i, callback) => {
    const start = Date.now();
    async.timesLimit(
      opNum, concurrency, (i, callback) => func.call(
        ledgerStorage[api], callback),
      err => {
        const stop = Date.now();
        assertNoError(err);
        passes.push(Math.round(opNum / (stop - start) * 1000));
        callback();
      });
  }, err => {
    assertNoError(err);
    console.log('ops/sec passes', passes);
    console.log('average ops/sec', helpers.average(passes));
    callback();
  });
}
