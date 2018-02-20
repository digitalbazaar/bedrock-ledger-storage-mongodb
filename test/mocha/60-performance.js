/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

let storage;
describe('Performance tests', () => {

  before(done => {
    blsMongodb.add({}, {ledgerId: 'did:v1:' + uuid.v4()}, (err, result) => {
      if(err) {
        return done(err);
      }
      storage = result;
      done();
    });
  });
  describe('Blocks and Event Operations', () => {
    const blockNum = 1000;
    const eventNum = 10;
    const opNum = 2500;
    const opNumLow = 250;
    const passNum = 10;
    const outstandingEventNum = 250;
    let blocksAndEvents;
    it(`generating ${blockNum} blocks`, function(done) {
      this.timeout(320000);
      helpers.createBlocks({
        blockNum,
        blockTemplate: mockData.eventBlocks.alpha,
        eventNum,
        eventTemplate: mockData.events.alpha
      }, (err, result) => {
        assertNoError(err);
        blocksAndEvents = result;
        done();
      });
    });

    // NOTE: the events added here are referenced in the blocks.add test
    it(`events.add events`, function(done) {
      this.timeout(320000);
      console.log(`Adding ${blocksAndEvents.events.length} events.`);
      async.eachLimit(blocksAndEvents.events, 100, (e, callback) =>
        storage.events.add({event: e.event, meta: e.meta}, err => {
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
          storage.blocks.add({block, meta}, err => {
            assertNoError(err);
            callback();
          });
        }, done);
    });
    it(`add ${outstandingEventNum} events without consensus`, function(done) {
      this.timeout(320000);
      async.auto({
        create: callback => helpers.createEvent({
          eventTemplate: mockData.events.alpha,
          eventNum: outstandingEventNum,
          consensus: false
        }, callback),
        add: ['create', (results, callback) =>
          async.eachLimit(results.create, 100, (e, callback) =>
            storage.events.add({event: e.event, meta: e.meta}, err => {
              assertNoError(err);
              callback();
            }), callback)]
      }, done);
    });
    it(`blocks.getLatestSummary ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: storage.blocks.getLatestSummary, api: 'blocks', passNum, opNum
      }, done);
    });
    it(`blocks.getLatest ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: storage.blocks.getLatest, api: 'blocks', passNum, opNum
      }, done);
    });
    it(`events.getLatestConfig ${opNum} times`, function(done) {
      this.timeout(320000);
      runPasses({
        func: storage.events.getLatestConfig, api: 'events', passNum, opNum
      }, done);
    });
  });
});

function runPasses({func, passNum, opNum, api, concurrency = 100}, callback) {
  const passes = [];
  async.timesSeries(passNum, (i, callback) => {
    const start = Date.now();
    async.timesLimit(
      opNum, concurrency, (i, callback) => func.call(storage[api], callback),
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
