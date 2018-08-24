/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const {callbackify} = require('util');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const mockPlugin = require('./mock.plugin');
const uuid = require('uuid/v4');

const exampleLedgerId = () => `did:v1:${uuid()}`;
const exampleLedgerNodeId = () => `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId();

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = configEventTemplate.ledger + '/blocks/1';

// register mock plugin
brLedgerNode.use('mock', mockPlugin);

describe('Storage Plugin API', () => {
  describe('extention of storage classes', () => {
    it('classes are extended on storage add', done => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      async.auto({
        storage: callback => blsMongodb.add(meta, options, callback),
        test: ['storage', (results, callback) => {
          should.exist(results.storage.operations.plugins.mock.mockQuery);
          callback();
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('classes are extended on storage get', done => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      async.auto({
        storage: callback => blsMongodb.add(meta, options, callback),
        get: ['storage', (results, callback) => {
          const {id} = results.storage;
          blsMongodb.get(id, {}, callback);
        }],
        test: ['get', (results, callback) => {
          should.exist(results.get.operations.plugins.mock.mockQuery);
          callback();
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
  });
  describe('index API', () => {
    it('plugin adds an index to the operations collection', done => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      async.auto({
        storage: callback => blsMongodb.add(meta, options, callback),
        test: ['storage', (results, callback) => {
          const {storage} = results;
          storage.operations.collection.indexExists(
            'mockIndex', (err, result) => {
              assertNoError(err);
              result.should.be.true;
              callback();
            });
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
  });
  describe('mock record query API', () => {
    let ledgerStorage;

    beforeEach(done => {
      const block = bedrock.util.clone(configBlockTemplate);
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };

      async.auto({
        initStorage: callback => blsMongodb.add(
          meta, options, (err, storage) => {
            ledgerStorage = storage;
            callback(err, storage);
          }),
        eventHash: callback => helpers.testHasher(
          configEventTemplate, callback),
        blockHash: callback => helpers.testHasher(block, callback),
        addEvent: ['initStorage', 'eventHash', (results, callback) => {
          const meta = {
            blockHeight: 0,
            blockOrder: 0,
            consensus: true,
            consensusDate: Date.now(),
            eventHash: results.eventHash
          };
          ledgerStorage.events.add(
            {event: configEventTemplate, meta}, callback);
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
    it('record query returns the proper result', done => {
      async.auto({
        concerts: callback => {
          const eventTemplate = mockData.events.alpha;
          const opTemplate = mockData.operations.alpha;
          helpers.addEvent({
            consensus: true, count: 5, eventTemplate, ledgerStorage, opTemplate
          }, callback);
        },
        offers: ['concerts', (results, callback) => {
          const eventTemplate = mockData.events.alpha;
          const opTemplate = mockData.operations.gamma;
          const eventHashes = Object.keys(results.concerts);
          opTemplate.record.event = results.concerts[eventHashes[0]]
            .operations[0].operation.record.id;
          helpers.addEvent({
            consensus: true, count: 1, eventTemplate, ledgerStorage, opTemplate
          }, callback);
        }],
        recordAlpha: ['offers', (results, callback) => {
          const eventHashes = Object.keys(results.concerts);
          const concertIds = [
            results.concerts[eventHashes[0]].operations[0].operation.record.id,
            results.concerts[eventHashes[1]].operations[0].operation.record.id,
          ];
          // the mockQuery API has been implemented using async/await
          const mockQuery = callbackify(
            ledgerStorage.operations.plugins.mock.mockQuery);
          mockQuery({
            maxBlockHeight: 100,
            query: {
              type: 'Offer',
              event: concertIds,
            }
          }, (err, result) => {
            assertNoError(err);
            should.exist(result);
            result.should.be.an('object');
            should.exist(result.records);
            result.records.should.be.an('array');
            result.records.should.have.length(1);
            const offerEventHashes = Object.keys(results.offers);
            result.records[0].should.equal(results.offers[offerEventHashes[0]]
              .operations[0].operation.record.id);
            callback();
          });
        }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('returns NotFoundError when there are no matching records', done => {
      async.auto({
        concerts: callback => {
          const eventTemplate = mockData.events.alpha;
          const opTemplate = mockData.operations.alpha;
          helpers.addEvent({
            consensus: true, count: 5, eventTemplate, ledgerStorage, opTemplate
          }, callback);
        },
        offers: ['concerts', (results, callback) => {
          const eventTemplate = mockData.events.alpha;
          const opTemplate = mockData.operations.gamma;
          const eventHashes = Object.keys(results.concerts);
          opTemplate.record.event = results.concerts[eventHashes[0]]
            .operations[0].operation.record.id;
          helpers.addEvent({
            consensus: true, count: 1, eventTemplate, ledgerStorage, opTemplate
          }, callback);
        }],
        query: ['offers', (results, callback) => {
          // the mockQuery API has been implemented using async/await
          const mockQuery = callbackify(
            ledgerStorage.operations.plugins.mock.mockQuery);
          // NOTE: querying for an unknown type
          mockQuery({
            maxBlockHeight: 100,
            query: {
              type: 'UnknownType',
            }
          }, (err, result) => {
            should.exist(err);
            should.not.exist(result);
            should.exist(err.name);
            err.name.should.equal('NotFoundError');
            callback();
          });
        }],
      }, err => {
        assertNoError(err);
        done();
      });
    });
  }); // end query API
});
