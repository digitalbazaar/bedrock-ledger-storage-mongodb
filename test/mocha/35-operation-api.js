/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

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
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Operation Storage API', () => {
  let ledgerStorage;

  beforeEach(async () => {
    const block = bedrock.util.clone(configBlockTemplate);
    let meta = {};
    const options = {
      ledgerId: exampleLedgerId, ledgerNodeId: exampleLedgerNodeId
    };

    ledgerStorage = await blsMongodb.add(meta, options);
    const eventHash = await helpers.testHasher(configEventTemplate);
    const blockHash = await helpers.testHasher(block);

    meta = {
      blockHeight: 0,
      blockOrder: 0,
      consensus: true,
      consensusDate: Date.now(),
      eventHash
    };
    await ledgerStorage.events.add({event: configEventTemplate, meta});

    // blockHash and consensus are normally created by consensus plugin
    meta.blockHash = blockHash;
    meta.consensus = Date.now();
    block.blockHeight = 0;
    block.event = [eventHash];
    await ledgerStorage.blocks.add({block, meta});
  });

  describe('getRecordHistory API', () => {
    it('gets history for two different records', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const events = await helpers.addEvent({
        consensus: true, count: 2, eventTemplate, ledgerStorage, opTemplate});
      const eventHashes = Object.keys(events);
      // record alpha
      {
        const {operation} = events[eventHashes[0]].operations[0];
        const {id: recordId} = operation.record;
        const result = await ledgerStorage.operations.getRecordHistory(
          {recordId});
        should.exist(result);
        result.should.be.an('array');
        result.should.have.length(1);
        const o = result[0];
        should.exist(o.meta);
        should.exist(o.operation);
        o.operation.should.eql(operation);
      }
      // record beta
      {
        const {operation} = events[eventHashes[0]].operations[0];
        const {id: recordId} = operation.record;
        const result = await ledgerStorage.operations.getRecordHistory(
          {recordId});
        should.exist(result);
        result.should.be.an('array');
        result.should.have.length(1);
        const o = result[0];
        should.exist(o.meta);
        should.exist(o.operation);
        o.operation.should.eql(operation);
      }
    });
    it('returns NotFoundError on an unknown recordId', async () => {
      const recordId = 'https://example.com/record/unknown';
      let result;
      let err;
      try {
        result = await ledgerStorage.operations.getRecordHistory({recordId});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
    });
    it('does not get history for an operation without consensus', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      // the helper creates events without consensus by default
      const events = await helpers.addEvent(
        {eventTemplate, ledgerStorage, opTemplate});
      const eventHashes = Object.keys(events);
      const {operation} = events[eventHashes[0]].operations[0];
      const {id: recordId} = operation.record;
      let result;
      let err;
      try {
        result = await ledgerStorage.operations.getRecordHistory(
          {recordId});
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
    });
    it('gets history w/ several CreateWebLedgerRecord operations', async () => {
      // it is acceptable for this to happen, the state machine is responsible
      // for picking for determining which record to use
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const testRecordId = `https://example.com/event/${uuid()}`;
      // the helper creates events without consensus by default
      await helpers.addEvent({
        consensus: true, count: 2, eventTemplate, ledgerStorage, opTemplate,
        recordId: testRecordId
      });
      const result = await ledgerStorage.operations.getRecordHistory(
        {recordId: testRecordId});
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(2);
      // the operations should be in separate events
      result[0].meta.eventHash.should.not.equal(
        result[1].meta.eventHash);
      // the operationHash should be the same
      result[0].meta.operationHash.should.equal(
        result[1].meta.operationHash);
    });
    it('gets history for a record with one update', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      // the helper creates events without consensus by default
      const createOperation = await helpers.addEvent({
        consensus: true, eventTemplate, ledgerStorage, opTemplate,
        recordId: testRecordId
      });
      // update operation
      const updateOperation = await helpers.addEvent({
        consensus: true, eventTemplate, ledgerStorage,
        opTemplate: updateOperationTemplate, recordId: testRecordId,
        startBlockHeight: 2
      });
      const result = await ledgerStorage.operations.getRecordHistory(
        {recordId: testRecordId});
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(2);
      let eventHashes = Object.keys(createOperation);
      let {operation} = createOperation[eventHashes[0]]
        .operations[0];
      result[0].operation.should.eql(operation);
      eventHashes = Object.keys(updateOperation);
      operation = updateOperation[eventHashes[0]]
        .operations[0].operation;
      result[1].operation.should.eql(operation);
    });
    it('gets history for a record with four updates', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      // the helper creates events without consensus by default
      const createOperation = await helpers.addEvent({
        consensus: true, eventTemplate, ledgerStorage, opTemplate,
        recordId: testRecordId
      });
      const updateOperation = await helpers.addEvent({
        consensus: true, count: 4, eventTemplate, ledgerStorage,
        opTemplate: updateOperationTemplate, recordId: testRecordId,
        startBlockHeight: 2
      });
      const result = await ledgerStorage.operations.getRecordHistory(
        {recordId: testRecordId});
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(5);
      const ops = [];
      for(const eventHash in createOperation) {
        ops.push(createOperation[eventHash].operations[0].operation);
      }
      for(const eventHash in updateOperation) {
        ops.push(updateOperation[eventHash].operations[0].operation);
      }
      result.map(o => o.operation).should.eql(ops);
    });
    it('updates without consensus are not included in history', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      // the helper creates events without consensus by default
      const createOperation = await helpers.addEvent({
        consensus: true, eventTemplate, ledgerStorage, opTemplate,
        recordId: testRecordId
      });
      // no consensus here
      await helpers.addEvent({
        consensus: false, count: 2, eventTemplate, ledgerStorage,
        opTemplate: updateOperationTemplate, recordId: testRecordId,
        startBlockHeight: 2
      });
      // consensus here
      const updateOperationBeta = await helpers.addEvent({
        consensus: true, count: 2, eventTemplate, ledgerStorage,
        opTemplate: updateOperationTemplate, recordId: testRecordId,
        startBlockHeight: 5
      });
      const result = await ledgerStorage.operations.getRecordHistory(
        {recordId: testRecordId});
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(3);
      const ops = [];
      for(const eventHash in createOperation) {
        ops.push(createOperation[eventHash].operations[0].operation);
      }
      // operations from updateOperationAlpha should not be included
      for(const eventHash in updateOperationBeta) {
        ops.push(updateOperationBeta[eventHash].operations[0].operation);
      }
      result.map(o => o.operation).should.eql(ops);
    });
    it('throws TypeError on invalid maxBlockHeight param', async () => {
      let err;
      try {
        await ledgerStorage.operations.getRecordHistory(
          {maxBlockHeight: -1, recordId: 'urn:test'});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('TypeError');
      err.message.should.equal('maxBlockHeight must be an integer >= 0.');
    });
  }); // end getRecordHistory API

  describe('exists API', () => {
    it('properly indexed with operationHash param', async () => {
      const result = await ledgerStorage.operations.exists(
        {explain: true, operationHash: 'foo'});
      result.executionStats.executionStages.inputStage.indexName.should.equal(
        'operation.operationHash.core.1');
    });
    it('properly indexed with operationHash and eventHash params', async () => {
      const result = await ledgerStorage.operations.exists(
        {eventHash: 'bar', explain: true, operationHash: 'foo'});
      // NOTE: operation.eventHash.core.1 index is a rejected plan here, but
      // may also be selected under different conditions
      result.executionStats.executionStages.inputStage.indexName.should.be.
        oneOf(['operation.operationHash.core.1', 'operation.eventHash.core.1']);
    });
    it('properly indexed with recordId param', async () => {
      const result = await ledgerStorage.operations.exists(
        {explain: true, recordId: 'foobar'});
      const {inputStage} = result.executionStats.executionStages;
      inputStage.stage.should.equal('PROJECTION_COVERED');
      inputStage.inputStage.stage.should.equal('IXSCAN');
      inputStage.inputStage.indexName.should.equal('operation.recordId.core.1');
    });
    it('properly shows existence recordId param', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const testRecordId = `https://example.com/event/${uuid()}`;
      // the helper creates events without consensus by default
      await helpers.addEvent({
        consensus: true, eventTemplate, ledgerStorage, opTemplate,
        recordId: testRecordId
      });

      const result = await ledgerStorage.operations.exists(
        {recordId: testRecordId});

      result.should.equal(true);
    });
    it('properly does not show existence with recordId param', async () => {
      const recordId = 'foobar';
      const result = await ledgerStorage.operations.exists({recordId});
      result.should.equal(false);
    });
  });
});
