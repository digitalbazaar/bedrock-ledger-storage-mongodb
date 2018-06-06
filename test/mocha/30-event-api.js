/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const {expect} = global.chai;
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid();
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Event Storage API', () => {
  let ledgerStorage;
  let counter = 0;

  before(done => {
    const block = bedrock.util.clone(configBlockTemplate);
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
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  describe('add API', () => {
    it('should add event', done => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      let operations;
      async.auto({
        operationHash: callback => helpers.testHasher(
          operation, (err, opHash) => {
            if(err) {
              return callback(err);
            }
            testEvent.operationHash = [opHash];
            callback(null, opHash);
          }),
        eventHash: ['operationHash', (results, callback) => helpers.testHasher(
          testEvent, callback)],
        operation: ['eventHash', (results, callback) => {
          const {eventHash, operationHash} = results;
          operations = [{
            meta: {
              eventHash: database.hash(eventHash), eventOrder: 0, operationHash
            },
            operation,
          }];
          ledgerStorage.operations.addMany({operations}, callback);
        }],
        add: ['operation', (results, callback) => {
          meta.eventHash = results.eventHash;
          ledgerStorage.events.add({event: testEvent, meta}, callback);
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
        }]
      }, err => done(err));
    });
    it('returns InvalidStateError if ops not properly associated', done => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      async.auto({
        opHash: callback => helpers.testHasher(operation, (err, opHash) => {
          if(err) {
            return callback(err);
          }
          testEvent.operationHash = [opHash];
          callback(null, opHash);
        }),
        eventHash: ['opHash', (results, callback) => helpers.testHasher(
          testEvent, callback)],
        add: ['eventHash', (results, callback) => {
          meta.eventHash = results.eventHash;
          ledgerStorage.events.add({event: testEvent, meta}, (err, result) => {
            should.exist(err);
            should.not.exist(result);
            err.name.should.equal('InvalidStateError');
            callback();
          });
        }],
      }, err => done(err));
    });
    it('throws TypeError if `meta.eventHash` is omitted', done => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      async.auto({
        opHash: callback => helpers.testHasher(operation, (err, opHash) => {
          if(err) {
            return callback(err);
          }
          testEvent.operationHash = [opHash];
          callback(null, opHash);
        }),
        add: ['opHash', (results, callback) => {
          expect(() => ledgerStorage.events.add(
            {event: testEvent, meta}, callback)).to.throw(TypeError);
          callback();
        }],
      }, err => done(err));
    });
    it('throws TypeError if `event` is omitted', done => {
      const meta = {};
      expect(() => ledgerStorage.events.add({meta}, () => {}))
        .to.throw(TypeError);
      done();
    });
    it('throws TypeError if `meta` is omitted', done => {
      const event = {};
      expect(() => ledgerStorage.events.add({event}, () => {}))
        .to.throw(TypeError);
      done();
    });
    it('returns error if `operationHash` is missing', done => {
      const event = bedrock.util.clone(mockData.events.alpha);
      const meta = {};
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, (err, result) => {
            should.exist(err);
            should.not.exist(result);
            err.name.should.equal('DataError');
            callback();
          });
        }],
      }, err => done(err));
    });
    it('should not add duplicate event', done => {
      const event = bedrock.util.clone(configEventTemplate);
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
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const fakeEvents = [];
      for(let i = 0; i < 5; ++i) {
        const event = bedrock.util.clone(mockData.events.alpha);
        event.operationHash = ['urn:uuid:' + uuid()];
        fakeEvents.push(event);
      }
      async.auto({
        fakeHashes: callback => async.map(
          fakeEvents, helpers.testHasher, callback),
        events: callback => helpers.addEvent(
          {count: 2, eventTemplate, ledgerStorage, opTemplate}, callback),
        difference: ['events', 'fakeHashes', (results, callback) => {
          const {fakeHashes} = results;
          const realHashes = Object.keys(results.events);
          const allHashes = [...fakeHashes, ...realHashes];
          ledgerStorage.events.difference(allHashes, (err, result) => {
            assertNoError(err);
            should.exist(result);
            result.should.be.an('array');
            result.should.have.length(5);
            result.should.have.same.members(fakeHashes);
            callback();
          });
        }]
      }, done);
    });
    it('returns empty array if all the events are in storage', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      async.auto({
        events: callback => helpers.addEvent(
          {count: 5, eventTemplate, ledgerStorage, opTemplate}, callback),
        difference: ['events', (results, callback) => {
          const realHashes = Object.keys(results.events);
          const allHashes = [...realHashes];
          ledgerStorage.events.difference(allHashes, (err, result) => {
            assertNoError(err);
            should.exist(result);
            result.should.be.an('array');
            result.should.have.length(0);
            callback();
          });
        }]
      }, done);
    });
  }); // end difference API

  describe('exists API', () => {
    it('returns true if an event exists', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      async.auto({
        events: callback => helpers.addEvent(
          {eventTemplate, ledgerStorage, opTemplate}, callback),
        test: ['events', (results, callback) => {
          const eventHash = Object.keys(results.events)[0];
          ledgerStorage.events.exists(eventHash, (err, result) => {
            assertNoError(err);
            result.should.be.true;
            callback();
          });
        }]}, err => done(err));
    });
    it('returns true if multiple events exist', done => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      async.auto({
        events: callback => helpers.addEvent(
          {count: 5, eventTemplate, ledgerStorage, opTemplate}, callback),
        test: ['events', (results, callback) => {
          const eventHash = Object.keys(results.events);
          ledgerStorage.events.exists(eventHash, (err, result) => {
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
  }); // end exists API

  describe('get API', () => {
    it('should get event with given hash', done => {
      const event = bedrock.util.clone(configEventTemplate);
      event.description = counter++;
      const meta = {};
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          ledgerStorage.events.add({event, meta}, callback);
        }],
        get: ['add', (results, callback) => {
          const eventHash = results.add.meta.eventHash;
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

  describe('getActiveConfig API', () => {
    it('should get active config for the given blockHeight', done => {
      const eventAlpha = bedrock.util.clone(configEventTemplate);
      eventAlpha.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const eventBeta = bedrock.util.clone(configEventTemplate);
      eventBeta.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const meta = {};
      async.auto({
        hashAlpha: callback => helpers.testHasher(eventAlpha, callback),
        hashBeta: callback => helpers.testHasher(eventBeta, callback),
        addAlpha: ['hashAlpha', (results, callback) => {
          meta.eventHash = results.hashAlpha;
          meta.blockHeight = 20;
          meta.consensus = true;
          meta.consensusDate = Date.now();
          ledgerStorage.events.add({event: eventAlpha, meta}, callback);
        }],
        addBeta: ['hashBeta', (results, callback) => {
          meta.eventHash = results.hashBeta;
          meta.blockHeight = 30;
          meta.consensus = true;
          meta.consensusDate = Date.now();
          ledgerStorage.events.add({event: eventBeta, meta}, callback);
        }],
        get: ['addAlpha', 'addBeta', (results, callback) => {
          ledgerStorage.events.getLatestConfig((err, result) => {
            assertNoError(err);
            should.exist(result);
            const {event} = result;
            event.should.eql(eventBeta);
            callback();
          });
        }],
        getBeforeBlockHeight: ['get', (results, callback) => {
          // specifying the blockHeight for the beta config
          ledgerStorage.events.getActiveConfig(
            {blockHeight: 30}, (err, result) => {
              assertNoError(err);
              should.exist(result);
              const {event} = result;
              event.should.eql(eventAlpha);
              callback();
            });
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('returns NotFoundError when there is no configuration', done => {
      const meta = {};
      const options = {ledgerId: `urn:${uuid()}`};
      async.auto({
        ledgerStorage: callback => blsMongodb.add(meta, options, callback),
        latest: ['ledgerStorage', (results, callback) => {
          const {ledgerStorage} = results;
          ledgerStorage.events.getActiveConfig(
            {blockHeight: 10}, (err, result) => {
              should.exist(err);
              should.not.exist(result);
              err.name.should.equal('NotFoundError');
              callback();
            });
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
  }); // end getActiveConfig API

  describe('getLatestConfig API', () => {
    it('should get latest config event', done => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.consensusMethod = `urn:${uuid}`;
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
      }, err => {
        assertNoError(err);
        done();
      });
    });
    it('returns NotFoundError when there is no configuration', done => {
      const meta = {};
      const options = {ledgerId: `urn:${uuid()}`};
      async.auto({
        ledgerStorage: callback => blsMongodb.add(meta, options, callback),
        latest: ['ledgerStorage', (results, callback) => {
          const {ledgerStorage} = results;
          ledgerStorage.events.getLatestConfig((err, result) => {
            should.exist(err);
            should.not.exist(result);
            err.name.should.equal('NotFoundError');
            callback();
          });
        }]
      }, err => {
        assertNoError(err);
        done();
      });
    });
  }); // end getLatestConfig API

  describe('update API', () => {
    it('should update event', done => {
      const event = bedrock.util.clone(configEventTemplate);
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

          const eventHash = results.create.meta.eventHash;
          ledgerStorage.events.update({eventHash, patch}, callback);
        }],
        get: ['update', (results, callback) => {
          const eventHash = results.create.meta.eventHash;
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
      const event = bedrock.util.clone(configEventTemplate);
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
