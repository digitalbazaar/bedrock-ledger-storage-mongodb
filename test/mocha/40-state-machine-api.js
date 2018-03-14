/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
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

  beforeEach(done => {
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
        block.blockHeight = 0;
        meta.blockHash = results.blockHash;
        meta.consensus = true;
        meta.consensusDate = Date.now();
        block.event = [results.eventHash];
        ledgerStorage.blocks.add({block, meta}, callback);
      }]
    }, done);
  });
  it('should get state machine object by id', done => {
    const blockTemplate = eventBlockTemplate;
    const eventTemplate = mockData.events.alpha;
    let operation1;
    let operation2;
    async.auto({
      create: callback => helpers.createBlocks(
        {blockTemplate, eventTemplate, blockNum: 2}, (err, result) => {
          operation1 = result.events[0].event.operation[0];
          operation2 = result.events[1].event.operation[0];
          callback(err, result);
        }),
      event: ['create', (results, callback) => {
        async.each(results.create.events, (e, callback) =>
          ledgerStorage.events.add(
            {event: e.event, meta: e.meta}, callback), callback);
      }],
      block: ['event', (results, callback) => {
        async.each(results.create.blocks, ({block, meta}, callback) =>
          ledgerStorage.blocks.add({block, meta}, callback), callback);
      }],
      get: ['block', 'event', (results, callback) => {
        ledgerStorage.stateMachine.get(operation1.record.id, callback);
      }],
      getTwo: ['get', (results, callback) => {
        ledgerStorage.stateMachine.get(operation2.record.id, callback);
      }],
      ensureObject: ['get', 'getTwo', (results, callback) => {
        const recordOne = results.get;
        should.exist(recordOne);
        should.exist(recordOne.object);
        should.exist(recordOne.object.id);
        should.exist(recordOne.meta);
        should.exist(recordOne.meta.blockHeight);
        recordOne.meta.blockHeight.should.equal(1);
        recordOne.object.should.deep.equal(operation1.record);
        const recordTwo = results.getTwo;
        recordTwo.object.should.deep.equal(operation2.record);
        // record blockHeight should still be `1` -- as the second operation
        // is rejected because the object already exists
        recordTwo.meta.blockHeight.should.equal(1);
        callback();
      }]
    }, err => {
      assertNoError(err);
      done(err);
    });
  });
  it('should get two state machine objects from different blocks by id',
    done => {
    const blockTemplate = eventBlockTemplate;
    const eventTemplate = mockData.events.alpha;
    let operation1;
    let operation2;
    async.auto({
      create: callback => helpers.createBlocks(
        {blockTemplate, eventTemplate, blockNum: 2}, (err, result) => {
          operation1 = result.events[0].event.operation[0];
          operation1.record.id = `urn:uuid:${uuid()}`;
          operation2 = result.events[1].event.operation[0];
          operation2.record.id = `urn:uuid:${uuid()}`;
          callback(err, result);
        }),
      event: ['create', (results, callback) => {
        async.each(results.create.events, (e, callback) =>
          ledgerStorage.events.add(
            {event: e.event, meta: e.meta}, callback), callback);
      }],
      block: ['event', (results, callback) => {
        async.each(results.create.blocks, ({block, meta}, callback) =>
          ledgerStorage.blocks.add({block, meta}, callback), callback);
      }],
      get: ['block', (results, callback) => {
        ledgerStorage.stateMachine.get(operation1.record.id, callback);
      }],
      get2: ['get', (results, callback) => {
        ledgerStorage.stateMachine.get(operation2.record.id, callback);
      }],
      ensureObject: ['get2', (results, callback) => {
        const record1 = results.get;
        should.exist(record1);
        should.exist(record1.object);
        should.exist(record1.object.id);
        should.exist(record1.meta);
        should.exist(record1.meta.blockHeight);
        record1.meta.blockHeight.should.equal(1);
        record1.object.should.deep.equal(operation1.record);

        const record2 = results.get2;
        should.exist(record2);
        should.exist(record2.object);
        should.exist(record2.object.id);
        should.exist(record2.meta);
        should.exist(record2.meta.blockHeight);
        record2.meta.blockHeight.should.equal(2);
        record2.object.should.deep.equal(operation2.record);
        callback();
      }]
    }, err => {
      assertNoError(err);
      done(err);
    });
  });
  it('should get state machine object by id after updating it', done => {
    const blockTemplate = eventBlockTemplate;
    const eventTemplate = mockData.events.alpha;
    let operation1;
    let operation2;
    async.auto({
      create: callback => helpers.createBlocks(
        {blockTemplate, eventTemplate, blockNum: 2}, (err, result) => {
          operation1 = result.events[0].event.operation[0];
          operation1.record.id = `urn:uuid:${uuid()}`;
          operation2 = result.events[1].event.operation[0];
          operation2.type = 'UpdateWebLedgerRecord';
          operation2.recordPatch = bedrock.util.clone(
            mockData.events.beta.operation[0].recordPatch);
          operation2.recordPatch.target = operation1.record.id;
          delete operation2.record;
          callback(err, result);
        }),
      event: ['create', (results, callback) => {
        async.each(results.create.events, (e, callback) =>
          ledgerStorage.events.add(
            {event: e.event, meta: e.meta}, callback), callback);
      }],
      block: ['event', (results, callback) => {
        async.each(results.create.blocks, ({block, meta}, callback) =>
          ledgerStorage.blocks.add({block, meta}, callback), callback);
      }],
      get: ['block', (results, callback) => {
        ledgerStorage.stateMachine.get(operation1.record.id, callback);
      }],
      ensureObject: ['get', (results, callback) => {
        const record = results.get;
        should.exist(record);
        should.exist(record.object);
        should.exist(record.object.id);
        should.exist(record.meta);
        should.exist(record.meta.blockHeight);
        record.meta.blockHeight.should.equal(2);
        const newObject = bedrock.util.clone(operation1.record);
        newObject.endDate =
          mockData.events.beta.operation[0].recordPatch.patch[0].value;
        record.object.should.deep.equal(newObject);
        callback();
      }]
    }, err => {
      assertNoError(err);
      done(err);
    });
  });
  it.skip('should get updated state machine object');
});
