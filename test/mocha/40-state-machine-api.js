/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
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

const eventBlockTemplate = _.cloneDeep(mockData.eventBlocks.alpha);

describe('State Machine Storage API', () => {
  let ledgerStorage;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {ledgerId: exampleLedgerId};

    async.auto({
      initStorage: callback => blsMongodb.add(
        meta, options, (err, storage) => {
          ledgerStorage = storage;
          callback(err, storage);
        }),
      hashConfig: callback => helpers.testHasher(configBlock, callback),
      addConfigBlock: ['initStorage', 'hashConfig', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
        configBlock.blockHeight = 0;
        meta.blockHash = results.hashConfig;
        meta.consensus = true;
        meta.consensusDate = Date.now();
        ledgerStorage.blocks.add(configBlock, meta, {}, callback);
      }]
    }, done);
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should get state machine object by id', done => {
    const blockTemplate = eventBlockTemplate;
    const eventTemplate = mockData.events.alpha;
    let event1;
    let event2;
    async.auto({
      create: callback => helpers.createBlocks(
        {blockTemplate, eventTemplate, blockNum: 2}, (err, result) => {
          event1 = result.events[0].event.input[0];
          event2 = result.events[1].event.input[0];
          callback(err, result);
        }),
      block: ['create', (results, callback) => {
        async.each(results.create.blocks, (b, callback) =>
          ledgerStorage.blocks.add(b.block, b.meta, callback), callback);
      }],
      event: ['create', (results, callback) => {
        async.each(results.create.events, (e, callback) =>
          ledgerStorage.events.add(e.event, e.meta, callback), callback);
      }],
      get: ['event', (results, callback) => {
        ledgerStorage.stateMachine.get(event1.id, callback);
      }],
      getTwo: ['event', (results, callback) => {
        ledgerStorage.stateMachine.get(event2.id, callback);
      }],
      ensureObject: ['get', 'getTwo', (results, callback) => {
        const recordOne = results.get;
        should.exist(recordOne);
        should.exist(recordOne.object);
        should.exist(recordOne.object.id);
        should.exist(recordOne.meta);
        should.exist(recordOne.meta.blockHeight);
        // FIXME: should blockHeight equal the block that contains the event?
        // recordOne.meta.blockHeight.should.equal(1);
        recordOne.object.should.deep.equal(event1);
        const recordTwo = results.getTwo;
        recordTwo.object.should.deep.equal(event2);
        recordOne.meta.blockHeight.should.equal(2);
        callback();
      }]
    }, err => {
      assertNoError(err);
      done(err);
    });
  });
  it.skip('should get updated state machine object');
});
