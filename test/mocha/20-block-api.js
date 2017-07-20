/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configEventTemplate = mockData.events.config;
const configBlockTemplate = mockData.configBlocks.alpha;
const eventBlockTemplate = mockData.eventBlocks.alpha;

configBlockTemplate.id = exampleLedgerId + '/blocks/1';
configEventTemplate.ledger = exampleLedgerId;

describe('Block Storage API', () => {
  let ledgerStorage;

  before(done => {
    const configEvent = _.cloneDeep(configEventTemplate);
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {};

    async.auto({
      initStorage: callback => blsMongodb.add(
        configEvent, meta, options, (err, storage) => {
          ledgerStorage = storage;
          callback(err, storage);
        }),
      hashConfig: callback => helpers.testHasher(configBlock, (err, result) => {
        callback(err, result);
      }),
      addConfigBlock: ['initStorage', 'hashConfig', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
        meta.blockHash = results.hashConfig;
        meta.consensus = Date.now();
        ledgerStorage.blocks.add(configBlock, meta, {}, callback);
      }]
    }, done);
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should add block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      consensus: Date.now()
    };
    const options = {};

    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      add: ['hash', (results, callback) => {
        meta.blockHash = results.hash;
        ledgerStorage.blocks.add(eventBlock, meta, options, callback);
      }],
      ensureAdd: ['add', (results, callback) => {
        const result = results.add;
        should.exist(result);
        should.exist(result.block);
        should.exist(result.meta);

        // ensure the block was created in the database
        const query = {id: database.hash(eventBlock.id)};
        ledgerStorage.blocks.collection.findOne(query, callback);
      }],
      ensureBlock: ['ensureAdd', (results, callback) => {
        const record = results.ensureAdd;
        should.exist(record);
        should.exist(record.id);
        should.exist(record.block.id);
        should.exist(record.meta.consensus);
        callback(0);
      }]}, err => done(err));
  });
  it('should not add duplicate block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      pending: true
    };
    const options = {};

    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      add: ['hash', (results, callback) => {
        meta.blockHash = results.hash;
        ledgerStorage.blocks.add(eventBlock, meta, options, callback);
      }]
    }, (err) => {
      should.exist(err);
      err.name.should.equal('DuplicateBlock');
      done();
    });
  });
  it('should get consensus block with given ID', done => {
    const blockId = exampleLedgerId + '/blocks/2';
    const options = {};

    // get an existing consensus block
    ledgerStorage.blocks.get(blockId, options, (err, result) => {
      should.not.exist(err);
      should.exist(result.block);
      should.exist(result.meta);
      result.block.id.should.equal(exampleLedgerId + '/blocks/2');
      done();
    });
  });
  it('should get all blocks with given ID', done => {
    const blockId = exampleLedgerId + '/blocks/2';
    const options = {};

    // get an existing block
    ledgerStorage.blocks.getAll(blockId, options, (err, iterator) => {
      should.not.exist(err);
      should.exist(iterator);

      let blockCount = 0;
      async.eachSeries(iterator, (promise, callback) => {
        promise.then(result => {
          should.exist(result.block);
          should.exist(result.meta);
          result.block.id.should.equal(exampleLedgerId + '/blocks/2');
          blockCount++;
          callback();
        }, callback);
      }, err => {
        blockCount.should.equal(1);
        done(err);
      });
    });
  });
  it('should fail to get non-existent block', done => {
    const blockId = exampleLedgerId + '/blocks/INVALID';
    const options = {};

    // attempt to get non-existent block
    let blockCount = 0;
    ledgerStorage.blocks.get(blockId, options, (err, iterator) => {
      async.eachSeries(iterator, (promise, callback) => {
        promise.then(result => {
          should.not.exist(result);
          blockCount++;
          callback();
        }, callback);
      }, err => {
        should.not.exist(err);
        blockCount.should.equal(0);
        done(err);
      });
    });
  });
  it('should update block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/4';
    eventBlock.event[0].id = exampleLedgerId + '/events/3';
    const meta = {
      testArrayOne: ['a', 'b'],
      testArrayTwo: ['a', 'b', 'c', 'z'],
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      create: ['hash', (results, callback) => {
        meta.blockHash = results.hash;
        ledgerStorage.blocks.add(eventBlock, meta, options, callback);
      }],
      update: ['create', (results, callback) => {
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
              consensus: Date.now()
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

        ledgerStorage.blocks.update(results.hash, patch, options, callback);
      }],
      get: ['update', (results, callback) => {
        ledgerStorage.blocks.get(eventBlock.id, options, callback);
      }]
    }, (err, results) => {
      should.not.exist(err);
      should.exist(results.get.meta.consensus);
      should.not.exist(results.get.meta.pending);
      results.get.meta.testArrayOne.should.eql(['a', 'b', 'c']);
      results.get.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
      done();
    });
  });
  it('should fail to update invalid block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/INVALID';
    eventBlock.event[0].id = exampleLedgerId + '/events/INVALID';
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      update: ['hash', (results, callback) => {
        const patch = [{
          op: 'unset',
          changes: {
            meta: {
              pending: 1
            }
          }
        }];

        ledgerStorage.blocks.update(results.hash, patch, options, callback);
      }],
      get: ['update', (results, callback) => {
        ledgerStorage.blocks.get(eventBlock.id, options, callback);
      }]
    }, err => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
  it('should remove block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/5';
    eventBlock.event[0].id = exampleLedgerId + '/events/4';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      create: ['hash', (results, callback) => {
        meta.blockHash = results.hash;
        ledgerStorage.blocks.add(eventBlock, meta, options, callback);
      }],
      delete: ['create', (results, callback) => {
        ledgerStorage.blocks.remove(results.hash, options, callback);
      }]
    }, err => {
      should.not.exist(err);
      done();
    });
  });
  it('should fail to remove non-existent block', done => {
    const blockHash = 'INVALID HASH';
    const options = {};

    // delete the block
    ledgerStorage.blocks.remove(blockHash, options, (err) => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
  it('should get genesis block', done => {
    const options = {};
    ledgerStorage.blocks.getGenesis(options, (err, result) => {
      should.not.exist(err);
      should.exist(result.genesisBlock);
      should.exist(result.genesisBlock.block);
      should.exist(result.genesisBlock.meta);
      should.not.exist(result.genesisBlock.block.previousBlock);
      should.not.exist(result.genesisBlock.block.previousBlockHash);
      done();
    });
  });
  it('should get latest block', done => {
    // get latest config and event blocks
    const options = {};
    ledgerStorage.blocks.getLatest(options, (err, result) => {
      should.not.exist(err);
      should.exist(result.eventBlock);
      should.exist(result.eventBlock.block);
      should.exist(result.eventBlock.meta);
      // TODO: needs more assertions that this is the latest block and/or
      // run on a chain with more blocks
      // TODO: add test that runs after another block that is not the latest
      // has had its meta updated
      done();
    });
  });
});
