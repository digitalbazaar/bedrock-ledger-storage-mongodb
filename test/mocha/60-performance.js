/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

let storage;
describe.only('Performance tests', () => {

  before(done => {
    blsMongodb.add({}, {ledgerId: 'did:v1:' + uuid.v4()}, (err, result) => {
      if(err) {
        return done(err);
      }
      storage = result;
      done();
    });
  });
  describe('Block', () => {
    const blockNum = 1000;
    const eventNum = 10;
    const opNum = 2500;
    const opNumLow = 250;
    const passNum = 10;
    let blocksAndEvents;
    it(`generating ${blockNum} blocks`, function(done) {
      this.timeout(120000);
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
    it(`blocks.add ${blockNum} blocks`, function(done) {
      this.timeout(120000);
      async.eachLimit(blocksAndEvents.blocks, 100, (b, callback) => {
        storage.blocks.add(b.block, b.meta, err => {
          assertNoError(err);
          callback();
        });
      }, done);
    });
    it(`events.add events`, function(done) {
      this.timeout(120000);
      console.log(`Adding ${blocksAndEvents.events.length} events.`);
      async.eachLimit(blocksAndEvents.events, 100, (e, callback) => {
        storage.events.add(e.event, e.meta, err => {
          assertNoError(err);
          callback();
        });
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it(`event.add 250 events without consensus`, function(done) {
      this.timeout(120000);
      async.auto({
        create: callback => helpers.createEvent({
          eventTemplate: mockData.events.alpha,
          eventNum: 250,
          consensus: false
        }, callback),
        add: ['create', (results, callback) =>
          async.eachLimit(results.create, 100, (e, callback) =>
            storage.events.add(e.event, e.meta, err => {
              assertNoError(err);
              callback();
            }), callback)]
      }, done);
    });
    it(`blocks.getLatestSummary ${opNum} times`, function(done) {
      this.timeout(120000);
      runPasses({
        func: storage.blocks.getLatestSummary, api: 'blocks', passNum, opNum
      }, done);
    });
    it(`blocks.getLatest ${opNum} times`, function(done) {
      this.timeout(120000);
      runPasses({
        func: storage.blocks.getLatest, api: 'blocks', passNum, opNum
      }, done);
    });
    it(`events.getLatestConfig ${opNum} times`, function(done) {
      this.timeout(120000);
      runPasses({
        func: storage.events.getLatestConfig, api: 'events', passNum, opNum
      }, done);
    });
    it(`events.getHashes ${opNumLow} times`, function(done) {
      this.timeout(180000);
      runPasses({
        func: storage.events.getHashes,
        concurrency: 3,
        api: 'events', passNum, opNum: opNumLow}, done);
    });
    it(`events.getHashes without consensus ${opNum} times`, function(done) {
      this.timeout(180000);
      runPasses({
        func: storage.events.getHashes,
        funcOptions: {consensus: false},
        api: 'events', passNum, opNum: opNumLow}, done);
    });
  });
});

function runPasses({
  func, funcOptions = {}, passNum, opNum, api, concurrency = 100
}, callback) {
  const passes = [];
  async.timesSeries(passNum, (i, callback) => {
    const start = Date.now();
    async.timesLimit(
      opNum, concurrency,
      (i, callback) => func.call(storage[api], funcOptions, callback), err => {
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
