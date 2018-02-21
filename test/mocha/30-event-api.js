/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configEventTemplate = _.cloneDeep(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = _.cloneDeep(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Event Storage API', () => {
  let ledgerStorage;
  let counter = 0;

  before(done => {
    const block = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {ledgerId: exampleLedgerId};

    async.auto({
      initStorage: callback => blsMongodb.add(meta, options, (err, storage) => {
        ledgerStorage = storage;
        callback(err, storage);
      }),
      eventHash: callback => helpers.testHasher(configEventTemplate, callback),
      blockHash: callback => helpers.testHasher(block, callback),
      addEvent: ['initStorage', 'eventHash', (results, callback) => {
        const meta = {
          consensus: true,
          consensusDate: Date.now(),
          eventHash: results.eventHash
        };
        ledgerStorage.events.add({event: configEventTemplate, meta}, callback);
      }],
      addConfigBlock: [
        'initStorage', 'blockHash', 'eventHash', (results, callback) => {
          // blockHash and consensus are normally created by consensus plugin
          meta.blockHash = results.blockHash;
          meta.consensus = Date.now();
          block.blockHeight = 0;
          block.event = [results.eventHash];
          ledgerStorage.blocks.add({block, meta}, callback);
        }]
    }, done);
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  describe('add API', () => {
    it('should add event', done => {
      const event = _.cloneDeep(mockData.events.alpha);
      const meta = {};
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
        }],
        ensureAdd: ['add', (results, callback) => {
          const result = results.add;
          should.exist(result);
          should.exist(result.event);
          should.exist(result.meta);

          // ensure the event was created in the database
          const query = {eventHash: database.hash(result.meta.eventHash)};
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
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
        }]
      }, err => {
        should.exist(err);
        err.name.should.equal('DuplicateError');
        done();
      });
    });
  }); // end add API

  describe('difference API', () => {
    it('returns eventHashes for events that are not in storage', done => {
      const events = [];
      for(let i = 0; i < 5; ++i) {
        const event = _.cloneDeep(mockData.events.alpha);
        event.id = 'urn:uuid:' + uuid();
        events.push(event);
      }
      async.auto({
        // hash all the events
        hash: callback => async.map(events, helpers.testHasher, callback),
        // only store the first two
        add: ['hash', (results, callback) => async.times(2, (i, callback) => {
          const meta = {eventHash: results.hash[i]};
          ledgerStorage.events.add({event: events[i], meta}, callback);
        }, callback)],
        difference: ['add', (results, callback) => {
          const expectedHashes = results.hash.map(h => database.hash(h));
          ledgerStorage.events.difference(expectedHashes, (err, result) => {
            assertNoError(err);
            should.exist(result);
            result.should.be.an('array');
            result.should.have.length(3);
            expectedHashes.splice(0, 2);
            result.should.have.same.members(expectedHashes);
            callback();
          });
        }]
      }, done);
    });
    it('returns empty array if all the events are in storage', done => {
      const events = [];
      for(let i = 0; i < 5; ++i) {
        const event = _.cloneDeep(mockData.events.alpha);
        event.id = 'urn:uuid:' + uuid();
        events.push(event);
      }
      async.auto({
        // hash all the events
        hash: callback => async.map(events, helpers.testHasher, callback),
        // store all the events
        add: ['hash', (results, callback) =>
          async.eachOf(events, (event, i, callback) => {
            const meta = {eventHash: results.hash[i]};
            ledgerStorage.events.add({event, meta}, callback);
          }, callback)],
        difference: ['add', (results, callback) =>
          ledgerStorage.events.difference(
            results.hash.map(h => database.hash(h)), (err, result) => {
              assertNoError(err);
              should.exist(result);
              result.should.be.an('array');
              result.should.have.length(0);
              callback();
            })]
      }, done);
    });
  }); // end difference API

  describe('exists API', () => {
    it('returns true if an event exists', done => {
      const event = _.cloneDeep(configEventTemplate);
      event.description = uuid();
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => ledgerStorage.events.add(
          {event, meta: {eventHash: results.hash}}, callback)],
        test: ['add', (results, callback) => {
          ledgerStorage.events.exists(
            database.hash(results.hash), (err, result) => {
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
          async.eachOf(events, (event, i, callback) =>
            ledgerStorage.events.add(
              {event, meta: {eventHash: results.hash[i]}}, callback),
          callback)
        ],
        test: ['add', (results, callback) => {
          ledgerStorage.events.exists(
            results.hash.map(h => database.hash(h)), (err, result) => {
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
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
        }],
        get: ['add', (results, callback) => {
          const eventHash = database.hash(results.add.meta.eventHash);
          ledgerStorage.events.get(eventHash, callback);
        }]
      }, (err, results) => {
        assertNoError(err);
        // get the event by hash
        assertNoError(err);
        results.get.meta.eventHash.should.equal(meta.eventHash);
        done();
      });
    });
  });
  describe('getLatestConfig API', () => {
    it('should get latest config event', done => {
      const event = _.cloneDeep(configEventTemplate);
      // FIXME: how is uniqueness of ledgerConfigurations guaranteed?
      event.ledgerConfiguration.consensusMethod = 'Continuity2017';
      const meta = {};
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          meta.blockHeight = 10000000;
          meta.consensus = true;
          meta.consensusDate = Date.now();
          ledgerStorage.events.add({event, meta}, callback);
        }],
        get: ['add', (results, callback) => {
          ledgerStorage.events.getLatestConfig(callback);
        }],
        ensureGet: ['get', (results, callback) => {
          const configEvent = results.get;
          configEvent.event.should.deep.equal(event);
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
      // create the block
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        create: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
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

          const eventHash = database.hash(results.create.meta.eventHash);
          ledgerStorage.events.update({eventHash, patch}, callback);
        }],
        get: ['update', (results, callback) => {
          const eventHash = database.hash(results.create.meta.eventHash);
          ledgerStorage.events.get(eventHash, callback);
        }]
      }, (err, results) => {
        assertNoError(err);
        should.exist(results.get.meta.consensus);
        should.not.exist(results.get.meta.pending);
        results.get.meta.testArrayOne.should.eql(['a', 'b', 'c']);
        results.get.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
        done();
      });
    });
    it('should fail to update invalid event', done => {
      const eventHash = 'ni:///sha-256;INVALID';
      const patch = [{
        op: 'unset',
        changes: {
          meta: {
            pending: 1
          }
        }
      }];
      ledgerStorage.events.update({eventHash, patch}, (err, result) => {
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
      // create the event
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        create: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
        }],
        delete: ['create', (results, callback) => {
          const eventHash = results.create.meta.eventHash;
          ledgerStorage.events.remove(eventHash, callback);
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('should fail to remove non-existent event', done => {
      const eventHash = 'ni:///sha-256;INVALID';
      ledgerStorage.events.remove(eventHash, (err, result) => {
        should.exist(err);
        should.not.exist(result);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  });
});
