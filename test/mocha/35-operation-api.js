/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
// const database = require('bedrock-mongodb');
const {expect} = global.chai;
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Operation Storage API', () => {
  let ledgerStorage;

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

  describe('getRecordHistory API', () => {
    it('gets history for two different records', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      async.auto({
        events: callback => helpers.addEvent({
          consensus: true, count: 2, eventTemplate, ledgerStorage, opTemplate
        }, callback),
        recordAlpha: ['events', (results, callback) => {
          const eventHashes = Object.keys(results.events);
          const {operation} = results.events[eventHashes[0]].operations[0];
          const {id: recordId} = operation.record;
          ledgerStorage.operations.getRecordHistory(
            {recordId}, (err, result) => {
              assertNoError(err);
              should.exist(result);
              result.should.be.an('array');
              result.should.have.length(1);
              const o = result[0];
              should.exist(o.meta);
              should.exist(o.operation);
              o.operation.should.eql(operation);
              callback();
            });
        }],
        recordBeta: ['recordAlpha', (results, callback) => {
          const eventHashes = Object.keys(results.events);
          const {operation} = results.events[eventHashes[1]].operations[0];
          const {id: recordId} = operation.record;
          ledgerStorage.operations.getRecordHistory(
            {recordId}, (err, result) => {
              assertNoError(err);
              should.exist(result);
              result.should.be.an('array');
              result.should.have.length(1);
              const o = result[0];
              should.exist(o.meta);
              should.exist(o.operation);
              o.operation.should.eql(operation);
              callback();
            });
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('returns NotFoundError on an unknown recordId', done => {
      const recordId = 'https://example.com/record/unknown';
      ledgerStorage.operations.getRecordHistory({recordId}, (err, result) => {
        should.exist(err);
        should.not.exist(result);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
    it('does not get history for an operation without consensus', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      async.auto({
        // the helper creates events without consensus by default
        events: callback => helpers.addEvent(
          {eventTemplate, ledgerStorage, opTemplate}, callback),
        recordAlpha: ['events', (results, callback) => {
          const eventHashes = Object.keys(results.events);
          const {operation} = results.events[eventHashes[0]].operations[0];
          const {id: recordId} = operation.record;
          ledgerStorage.operations.getRecordHistory(
            {recordId}, (err, result) => {
              should.exist(err);
              should.not.exist(result);
              err.name.should.equal('NotFoundError');
              callback();
            });
        }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('gets history with multiple CreateWebLedgerRecord operations', done => {
      // it is acceptable for this to happen, the state machine is responsible
      // for picking for determining which record to use
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const testRecordId = `https://example.com/event/${uuid()}`;
      async.auto({
        // the helper creates events without consensus by default
        events: callback => helpers.addEvent({
          consensus: true, count: 2, eventTemplate, ledgerStorage, opTemplate,
          recordId: testRecordId
        }, callback),
        recordAlpha: ['events', (results, callback) => {
          ledgerStorage.operations.getRecordHistory(
            {recordId: testRecordId}, (err, result) => {
              assertNoError(err);
              should.exist(result);
              result.should.be.an('array');
              result.should.have.length(2);
              // the operations should be in separate events
              result[0].meta.eventHash.should.not.equal(
                result[1].meta.eventHash);
              // the operationHash should be the same
              result[0].meta.operationHash.should.equal(
                result[1].meta.operationHash);
              callback();
            });
        }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('gets history for a record with one update', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      async.auto({
        // the helper creates events without consensus by default
        createOperation: callback => helpers.addEvent({
          consensus: true, eventTemplate, ledgerStorage, opTemplate,
          recordId: testRecordId
        }, callback),
        updateOperation: callback => helpers.addEvent({
          consensus: true, eventTemplate, ledgerStorage,
          opTemplate: updateOperationTemplate, recordId: testRecordId,
          startBlockHeight: 2
        }, callback),
        recordAlpha: [
          'createOperation', 'updateOperation', (results, callback) => {
            ledgerStorage.operations.getRecordHistory(
              {recordId: testRecordId}, (err, result) => {
                assertNoError(err);
                should.exist(result);
                result.should.be.an('array');
                result.should.have.length(2);
                let eventHashes = Object.keys(results.createOperation);
                let {operation} = results.createOperation[eventHashes[0]]
                  .operations[0];
                result[0].operation.should.eql(operation);
                eventHashes = Object.keys(results.updateOperation);
                operation = results.updateOperation[eventHashes[0]]
                  .operations[0].operation;
                result[1].operation.should.eql(operation);
                callback();
              });
          }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('gets history for a record with four updates', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      async.auto({
        // the helper creates events without consensus by default
        createOperation: callback => helpers.addEvent({
          consensus: true, eventTemplate, ledgerStorage, opTemplate,
          recordId: testRecordId
        }, callback),
        updateOperation: callback => helpers.addEvent({
          consensus: true, count: 4, eventTemplate, ledgerStorage,
          opTemplate: updateOperationTemplate, recordId: testRecordId,
          startBlockHeight: 2
        }, callback),
        recordAlpha: [
          'createOperation', 'updateOperation', (results, callback) => {
            ledgerStorage.operations.getRecordHistory(
              {recordId: testRecordId}, (err, result) => {
                assertNoError(err);
                should.exist(result);
                result.should.be.an('array');
                result.should.have.length(5);
                const ops = [];
                for(const eventHash in results.createOperation) {
                  ops.push(
                    results.createOperation[eventHash].operations[0].operation);
                }
                for(const eventHash in results.updateOperation) {
                  ops.push(
                    results.updateOperation[eventHash].operations[0].operation);
                }
                result.map(o => o.operation).should.eql(ops);
                callback();
              });
          }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('updates without consensus are not included in history', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const updateOperationTemplate = mockData.operations.beta;
      const testRecordId = `https://example.com/event/${uuid()}`;
      async.auto({
        // the helper creates events without consensus by default
        createOperation: callback => helpers.addEvent({
          consensus: true, eventTemplate, ledgerStorage, opTemplate,
          recordId: testRecordId
        }, callback),
        // no consensus here
        updateOperationAlpha: callback => helpers.addEvent({
          consensus: false, count: 2, eventTemplate, ledgerStorage,
          opTemplate: updateOperationTemplate, recordId: testRecordId,
          startBlockHeight: 2
        }, callback),
        // consensus here
        updateOperationBeta: callback => helpers.addEvent({
          consensus: true, count: 2, eventTemplate, ledgerStorage,
          opTemplate: updateOperationTemplate, recordId: testRecordId,
          startBlockHeight: 5
        }, callback),
        recordAlpha: [
          'createOperation', 'updateOperationAlpha', 'updateOperationBeta',
          (results, callback) => {
            ledgerStorage.operations.getRecordHistory(
              {recordId: testRecordId}, (err, result) => {
                assertNoError(err);
                should.exist(result);
                result.should.be.an('array');
                result.should.have.length(3);
                const ops = [];
                for(const eventHash in results.createOperation) {
                  ops.push(
                    results.createOperation[eventHash].operations[0].operation);
                }
                // operations from updateOperationAlpha should not be included
                for(const eventHash in results.updateOperationBeta) {
                  ops.push(
                    results.updateOperationBeta[eventHash].operations[0]
                      .operation);
                }
                result.map(o => o.operation).should.eql(ops);
                callback();
              });
          }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('throws TypeError on invalid maxBlockHeight param', done => {
      expect(() => ledgerStorage.operations.getRecordHistory(
        {maxBlockHeight: 0, recordId: 'urn:test'}, () => {}))
        .to.throw(/maxBlockHeight must be a positive integer./);
      done();
    });
  }); // end getRecordHistory API
});
