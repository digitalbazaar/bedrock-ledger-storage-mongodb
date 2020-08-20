/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {util: {uuid}} = bedrock;
const {promisify} = require('util');

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

const eventBlockTemplate = bedrock.util.clone(mockData.eventBlocks.alpha);
const opTemplate = mockData.operations.alpha;

const createBlocks = promisify(helpers.createBlocks);

describe('Block Storage API', () => {
  let ledgerStorage;

  beforeEach(done => {
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
        meta.consensus = true;
        meta.consensusDate = Date.now();
        block.blockHeight = 0;
        block.event = [results.eventHash];
        ledgerStorage.blocks.add({block, meta}, callback);
      }]
    }, done);
  }); // end beforeEach

  describe('add API', () => {
    it('should add block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        add: ['event', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)],
        ensureAdd: ['add', (results, callback) => {
          const result = results.add;
          should.exist(result);
          should.exist(result.block);
          should.exist(result.meta);

          // ensure the block was created in the database
          const {id: blockId} = results.create.blocks[0].block;
          const query = {id: database.hash(blockId)};
          ledgerStorage.blocks.collection.findOne(query, callback);
        }],
        ensureBlock: ['ensureAdd', (results, callback) => {
          const record = results.ensureAdd;
          should.exist(record);
          should.exist(record.id);
          should.exist(record.block.id);
          should.exist(record.meta.consensus);
          callback();
        }]},
      err => {
        assertNoError(err);
        done();
      });
    });
    it('should not add duplicate block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        add: ['event', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)],
        addAgain: ['add', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)]
      }, err => {
        should.exist(err);
        err.name.should.equal('DuplicateError');
        done();
      });
    });
  }); // end add API

  describe('get API', () => {
    it('should get consensus block with given ID', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      let block;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => {
          const event = results.create.events[0].event;
          const meta = results.create.events[0].meta;
          ledgerStorage.events.add({event, meta}, callback);
        }],
        block: ['event', (results, callback) => {
          block = results.create.blocks[0].block;
          const meta = results.create.blocks[0].meta;
          ledgerStorage.blocks.add({block, meta}, callback);
        }],
        get: ['block', (results, callback) =>
          ledgerStorage.blocks.get({blockId: block.id}, (err, result) => {
            assertNoError(err);
            should.exist(result.block);
            should.exist(result.meta);
            result.block.id.should.equal(block.id);
            callback();
          })]
      }, done);
    });
    it('should fail to get non-existent block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      let block;
      let blockCount = 0;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        block: ['create', (results, callback) => {
          block = results.create.blocks[0].block;
          callback();
        }],
        get: ['block', (results, callback) => ledgerStorage.blocks.get(
          {blockId: block.id}, (err, iterator) => {
            async.eachSeries(iterator, (promise, callback) => {
              promise.then(result => {
                should.not.exist(result);
                blockCount++;
                callback();
              }, callback);
            }, err => {
              assertNoError(err);
              blockCount.should.equal(0);
              callback();
            });
          })]
      }, done);
    });
  }); // end get API

  describe('update API', () => {
    it('should update block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      let block;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        block: ['event', (results, callback) => {
          block = results.create.blocks[0].block;
          const {meta} = results.create.blocks[0];
          _.assign(meta, {
            testArrayOne: ['a', 'b'],
            testArrayTwo: ['a', 'b', 'c', 'z'],
            pending: true
          });
          ledgerStorage.blocks.add({block, meta}, callback);
        }],
        update: ['block', 'event', (results, callback) => {
          const patch = [{
            op: 'unset',
            changes: {
              meta: {
                pending: 1
              }
            }
          }, {
            op: 'set',
            changes: {
              meta: {
                consensus: false
              }
            }
          }, {
            op: 'add',
            changes: {
              meta: {
                testArrayOne: 'c'
              }
            }
          }, {
            op: 'remove',
            changes: {
              meta: {
                testArrayTwo: 'z'
              }
            }
          }];
          const {blockHash} = results.create.blocks[0].meta;
          ledgerStorage.blocks.update({blockHash, patch}, callback);
        }],
        get: ['update', (results, callback) => {
          ledgerStorage.blocks.get(
            {blockId: block.id, consensus: false}, callback);
        }]
      }, (err, results) => {
        assertNoError(err);
        should.exist(results.get.meta.consensus);
        should.not.exist(results.get.meta.pending);
        results.get.meta.consensus.should.be.false;
        results.get.meta.testArrayOne.should.eql(['a', 'b', 'c']);
        results.get.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
        done();
      });
    });
    it('should fail to update invalid block', done => {
      async.auto({
        update: callback => {
          const patch = [{
            op: 'unset',
            changes: {
              meta: {
                pending: 1
              }
            }
          }];
          ledgerStorage.blocks.update(
            {blockHash: 'bogusHash', patch}, callback);
        }
      }, err => {
        should.exist(err);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  }); // end update API
  describe('remove API', () => {
    it('should remove block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        block: ['event', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)],
        delete: ['block', (results, callback) => {
          const {blockHash} = results.create.blocks[0].meta;
          ledgerStorage.blocks.remove(blockHash, callback);
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('should fail to remove non-existent block', done => {
      const blockHash = 'INVALID HASH';
      // delete the block
      ledgerStorage.blocks.remove(blockHash, err => {
        should.exist(err);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  }); // end remove API

  describe('getGenesis API', () => {
    it('should get genesis block', done => {
      ledgerStorage.blocks.getGenesis((err, result) => {
        assertNoError(err);
        should.exist(result.genesisBlock);
        should.exist(result.genesisBlock.block);
        should.exist(result.genesisBlock.meta);
        should.not.exist(result.genesisBlock.block.previousBlock);
        should.not.exist(result.genesisBlock.block.previousBlockHash);
        done();
      });
    });
  }); // end getGenesis API

  describe('getLatest API', () => {
    it('should get latest block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        block: ['event', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)],
        latest: ['block', (results, callback) =>
          ledgerStorage.blocks.getLatest((err, result) => {
            assertNoError(err);
            should.exist(result.eventBlock);
            should.exist(result.eventBlock.meta);
            should.exist(result.eventBlock.block);
            const block = result.eventBlock.block;
            should.exist(block.event);
            block.id.should.equal(block.id);
            callback();
          })]
      }, done);
    });
  }); // end getLatest

  describe('getLatestBlockHeight API', () => {
    it('should get latest block height', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {blocks, events, operations} = await createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);
      let result;
      let error;
      try {
        result = await ledgerStorage.blocks.getLatestBlockHeight();
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result);
      result.should.equal(1);
    });
    it('should be a covered query', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {blocks, events, operations} = await createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);
      let result;
      let error;
      try {
        result = await ledgerStorage.blocks.getLatestBlockHeight(
          {explain: true});
      } catch(e) {
        error = e;
      }
      assertNoError(error);
      should.exist(result);
      should.exist(result.executionStats);
      result.executionStats.nReturned.should.equal(1);
      result.executionStats.totalKeysExamined.should.equal(1);
      result.executionStats.totalDocsExamined.should.equal(0);
      result.executionStats.executionStages.inputStage.inputStage.indexName
        .should.equal('block.consensus.core.1');
    });
  }); // end getLatestBlockHeight

  describe('getLatestSummary API', () => {
    it('should get latest block', done => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      async.auto({
        create: callback => helpers.createBlocks(
          {blockTemplate, eventTemplate, opTemplate}, callback),
        operations: ['create', (results, callback) => {
          const {operations} = results.create;
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        event: ['operations', (results, callback) => ledgerStorage.events.add(
          results.create.events[0], callback)],
        block: ['event', (results, callback) => ledgerStorage.blocks.add(
          results.create.blocks[0], callback)],
        summary: ['block', 'event', (results, callback) =>
          ledgerStorage.blocks.getLatestSummary((err, result) => {
            assertNoError(err);
            should.exist(result.eventBlock);
            should.exist(result.eventBlock.meta);
            should.exist(result.eventBlock.block);
            const block = result.eventBlock.block;
            should.not.exist(block.event);
            block.id.should.equal(block.id);
            callback();
          })]
      }, done);
    });
  }); // end getLatestSummary
});
