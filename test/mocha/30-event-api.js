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

describe('Event Storage API', () => {
  let ledgerStorage;
  let counter = 0;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {ledgerId: exampleLedgerId};

    async.auto({
      initStorage: callback => blsMongodb.add(meta, options, (err, storage) => {
        ledgerStorage = storage;
        callback(err, storage);
      }),
      hashConfig: callback => helpers.testHasher(configBlock, callback),
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
  describe('add API', () => {
    it('should add event', done => {
      const event = _.cloneDeep(configEventTemplate);
      const meta = {};
      const options = {};

      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add(event, meta, options, callback);
        }],
        ensureAdd: ['add', (results, callback) => {
          const result = results.add;
          should.exist(result);
          should.exist(result.event);
          should.exist(result.meta);

          // ensure the event was created in the database
          const query = {eventHash: result.meta.eventHash};
          ledgerStorage.events.collection.findOne(query, callback);
        }],
        ensureEvent: ['ensureAdd', (results, callback) => {
          const record = results.ensureAdd;
          should.exist(record);
          should.exist(record.eventHash);
          should.exist(record.meta);
          should.exist(record.meta.eventHash);
          callback();
        }]}, err => done(err));
    });
    it('should not add duplicate event', done => {
      const event = _.cloneDeep(configEventTemplate);
      const meta = {};
      const options = {};

      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add(event, meta, options, callback);
        }]
      }, err => {
        should.exist(err);
        err.name.should.equal('DuplicateEvent');
        done();
      });
    });
  });
  describe('exists API', () => {
    it('returns true if an event exists', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.description = uuid();
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          ledgerStorage.events.add(event, {eventHash: results.hash}, callback);
        }],
        test: ['add', (results, callback) => {
          ledgerStorage.events.exists(results.hash, (err, result) => {
            assertNoError(err);
            result.should.be.true;
            callback();
          });
        }]}, err => done(err));
    });
    it('returns true if multiple events exist', done => {
      const events = [];
      for(let i = 0; i < 10; ++i) {
        const event = _.cloneDeep(configEventTemplate);
        event.description = uuid();
        events.push(event);
      }
      async.auto({
        hash: callback => async.map(events, helpers.testHasher, callback),
        add: ['hash', (results, callback) =>
          async.eachOf(events, (e, i, callback) =>
            ledgerStorage.events.add(e, {eventHash: results.hash[i]}, callback),
            callback)
        ],
        test: ['add', (results, callback) => {
          ledgerStorage.events.exists(results.hash, (err, result) => {
            assertNoError(err);
            result.should.be.true;
            callback();
          });
        }]}, err => done(err));
    });
    it('returns false if an event does not exist', done => {
      ledgerStorage.events.exists('unknownHash', (err, result) => {
        assertNoError(err);
        result.should.be.false;
        done();
      });
    });
  });
  describe('get API', () => {
    it('should get event with given hash', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.description = counter++;
      const meta = {};
      const options = {};

      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add(event, meta, options, callback);
        }],
        get: ['add', (results, callback) => {
          const eventHash = results.add.meta.eventHash;
          ledgerStorage.events.get(eventHash, options, callback);
        }]
      }, (err, results) => {
        should.not.exist(err);
        // get the event by hash
        should.not.exist(err);
        results.get.meta.eventHash.should.equal(meta.eventHash);
        done();
      });
    });
  });
  describe('getLatestConfig API', () => {
    it('should get latest config event', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.label = 'latest config event test';
      const meta = {};
      const options = {};

      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          meta.consensus = true;
          meta.consensusDate = Date.now();
          ledgerStorage.events.add(event, meta, options, callback);
        }],
        get: ['add', (results, callback) => {
          ledgerStorage.events.getLatestConfig(options, callback);
        }],
        ensureGet: ['get', (results, callback) => {
          const configEvent = results.get;
          configEvent.event.label.should.equal('latest config event test');
          callback();
        }]
      }, err => done(err));
    });
  });
  describe('update API', () => {
    it('should update event', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.description = counter++;
      const meta = {
        testArrayOne: ['a', 'b'],
        testArrayTwo: ['a', 'b', 'c', 'z'],
        pending: true
      };
      const options = {};

      // create the block
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        create: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add(event, meta, options, callback);
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

          const eventHash = results.create.meta.eventHash;
          ledgerStorage.events.update(eventHash, patch, options, callback);
        }],
        get: ['update', (results, callback) => {
          const eventHash = results.create.meta.eventHash;
          ledgerStorage.events.get(eventHash, options, callback);
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
    it('should fail to update invalid event', done => {
      const eventHash = 'ni:///sha-256;INVALID';
      const options = {};
      const patch = [{
        op: 'unset',
        changes: {
          meta: {
            pending: 1
          }
        }
      }];
      ledgerStorage.events.update(eventHash, patch, options, (err, result) => {
        should.exist(err);
        should.not.exist(result);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  });
  describe('remove API', () => {
    it('should remove event', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.description = counter++;
      const meta = {};
      const options = {};

      // create the event
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        create: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add(event, meta, options, callback);
        }],
        delete: ['create', (results, callback) => {
          const eventHash = results.create.meta.eventHash;
          ledgerStorage.events.remove(eventHash, options, callback);
        }]
      }, err => {
        should.not.exist(err);
        done();
      });
    });
    it('should fail to remove non-existent event', done => {
      const eventHash = 'ni:///sha-256;INVALID';
      const options = {};
      ledgerStorage.events.remove(eventHash, options, (err, result) => {
        should.exist(err);
        should.not.exist(result);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  });
});
