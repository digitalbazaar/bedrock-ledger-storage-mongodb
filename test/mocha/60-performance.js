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
  describe('Block', () => {
    const blockNum = 1000;
    const eventNum = 10;
    const opNum = 2500;
    const passNum = 10;
    let blocksAndEvents;
    it(`generating ${blockNum} blocks`, done => helpers.createBlocks({
      blockNum,
      blockTemplate: mockData.eventBlocks.alpha,
      eventNum,
      eventTemplate: mockData.events.alpha
    }, (err, result) => {
      assertNoError(err);
      blocksAndEvents = result;
      done();
    })).timeout(120000);
    it(`blocks.add ${blockNum} blocks`, done => {
      async.eachLimit(blocksAndEvents.blocks, 100, (b, callback) => {
        storage.blocks.add(b.block, b.meta, err => {
          assertNoError(err);
          callback();
        });
      }, done);
    }).timeout(120000);
    it(`events.add events`, done => {
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
    }).timeout(120000);
    it(`blocks.getLatestSummary ${opNum} times`, done => runPasses(
      {func: storage.blocks.getLatestSummary, passNum, opNum}, done
    )).timeout(120000);
    it(`blocks.getLatest ${opNum} times`, done => runPasses(
      {func: storage.blocks.getLatest, passNum, opNum}, done
    )).timeout(120000);
  });
});

function runPasses({func, passNum, opNum}, callback) {
  const passes = [];
  async.timesSeries(passNum, (i, callback) => {
    const start = Date.now();
    async.timesLimit(
      opNum, 100, (i, callback) => func.call(storage.blocks, callback), err => {
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
