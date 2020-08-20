/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {util: {uuid}} = bedrock;

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledgerConfiguration.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Event Storage API', () => {
  let ledgerStorage;

  beforeEach(done => {
    const block = bedrock.util.clone(configBlockTemplate);
    const meta = {};
    const options = {
      ledgerId: exampleLedgerId,
      ledgerNodeId: exampleLedgerNodeId,
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
          eventHash: results.eventHash,
          effectiveConfiguration: true
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
            meta: {eventHash, eventOrder: 0, operationHash},
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
          const query = {'meta.eventHash': result.meta.eventHash};
          ledgerStorage.events.collection.findOne(query, callback);
        }],
        ensureEvent: ['ensureAdd', (results, callback) => {
          const record = results.ensureAdd;
          should.exist(record);
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
    it('throws TypeError if `meta.eventHash` is omitted', async () => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      const opHash = await helpers.testHasher(operation);
      testEvent.operationHash = [opHash];
      let err;
      try {
        await ledgerStorage.events.add({event: testEvent, meta});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('TypeError');
    });
    it('throws TypeError if `event` is omitted', async () => {
      const meta = {};
      let err;
      try {
        await ledgerStorage.events.add({meta});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('TypeError');
    });
    it('throws TypeError if `meta` is omitted', async () => {
      const event = {};
      let err;
      try {
        await ledgerStorage.events.add({event});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('TypeError');
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
      const meta = {consensus: false};
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

  describe('exists API', function() {
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
    it('returns true if multiple events exist', function(done) {
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
      // calculate the hash of the genesis configuration at get the event
      const event = bedrock.util.clone(configEventTemplate);
      let eventHash;
      async.auto({
        eventHash: callback => helpers.testHasher(event, callback),
        get: ['eventHash', (results, callback) => {
          ({eventHash} = results);
          ledgerStorage.events.get(eventHash, callback);
        }]
      }, (err, results) => {
        assertNoError(err);
        results.get.event.should.eql(event);
        results.get.meta.eventHash.should.equal(eventHash);
        done();
      });
    });
  });

  describe('getEffectiveConfig API', () => {
    it('is properly indexed', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.sequence = 1;
      let eventHash = await helpers.testHasher(event);
      const meta = {
        eventHash,
        blockHeight: 10000000,
        consensus: true,
        consensusDate: Date.now(),
        effectiveConfiguration: true,
      };
      await ledgerStorage.events.add({event, meta});
      event.ledgerConfiguration.sequence = 2;
      eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      meta.blockHeight = 20000000;
      await ledgerStorage.events.add({event, meta});
      const result = await ledgerStorage.events
        .getEffectiveConfig({blockHeight: 1500000, explain: true});
      const {executionStats} = result;
      executionStats.executionStages.inputStage.inputStage.inputStage.indexName
        .should.equal('event.effectiveConfiguration.core.1');
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
    });
    it('should get the effective config for the given blockHeight', done => {
      const eventAlpha = bedrock.util.clone(configEventTemplate);
      eventAlpha.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const eventBeta = bedrock.util.clone(configEventTemplate);
      eventBeta.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const meta = {effectiveConfiguration: true};
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
          ledgerStorage.events.getEffectiveConfig(
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
      const options = {
        ledgerId: `urn:${uuid()}`,
        ledgerNodeId: `urn:uuid:${uuid()}`
      };
      async.auto({
        ledgerStorage: callback => blsMongodb.add(meta, options, callback),
        latest: ['ledgerStorage', (results, callback) => {
          const {ledgerStorage} = results;
          ledgerStorage.events.getEffectiveConfig(
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
  }); // end getEffectiveConfig API

  describe('getLatestConfig API', () => {
    it('is properly indexed', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.sequence = 1;
      let eventHash = await helpers.testHasher(event);
      const meta = {
        eventHash,
        blockHeight: 10000000,
        consensus: true,
        consensusDate: Date.now(),
        effectiveConfiguration: true,
      };
      await ledgerStorage.events.add({event, meta});
      event.ledgerConfiguration.sequence = 2;
      eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      meta.blockHeight = 20000000;
      await ledgerStorage.events.add({event, meta});
      const result = await ledgerStorage.events
        .getLatestConfig({explain: true});
      const {executionStats} = result;
      executionStats.executionStages.inputStage.inputStage.inputStage.indexName
        .should.equal('event.effectiveConfiguration.core.1');
      executionStats.totalKeysExamined.should.equal(1);
      executionStats.totalDocsExamined.should.equal(1);
    });
    it('should get latest valid config event', done => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      event.ledgerConfiguration.sequence = 1;
      const meta = {};
      async.auto({
        hash: callback => helpers.testHasher(event, callback),
        add: ['hash', (results, callback) => {
          meta.eventHash = results.hash;
          meta.blockHeight = 10000000;
          meta.consensus = true;
          meta.consensusDate = Date.now();
          meta.effectiveConfiguration = true;
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
      const options = {
        ledgerId: `urn:${uuid()}`,
        ledgerNodeId: `urn:uuid:${uuid()}`
      };
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

  describe('getMany', () => {
    it('TypeError if `blockHeight` and `eventHashes` specified', async () => {
      let error;
      let r;
      try {
        r = await ledgerStorage.events.getMany({
          blockHeight: 0,
          eventHashes: ['hash1', 'hash2']
        });
      } catch(e) {
        error = e;
      }
      should.not.exist(r);
      should.exist(error);
      error.should.be.instanceOf(TypeError);
    });
    it('returns a cursor using `blockHeight` parameter', async () => {
      const r = await ledgerStorage.events.getMany({blockHeight: 0});
      should.exist(r);
      should.exist(r.hasNext);
      (await r.hasNext()).should.be.true;
    });
    it('returns a cursor using `eventHashes` parameter', async () => {
      const r = await ledgerStorage.events.getMany({
        eventHashes: ['hash1', 'hash2']
      });
      should.exist(r);
      should.exist(r.hasNext);
      (await r.hasNext()).should.be.false;
    });
  }); // end getMany

  describe('hasEvent', () => {
    it('properly detects a configuration event', async () => {
      const r = await ledgerStorage.events.hasEvent(
        {blockHeight: 0, type: 'WebLedgerConfigurationEvent'});
      should.exist(r);
      r.should.be.a('boolean');
      r.should.be.true;
    });
    it('properly detects absence of an operation event', async () => {
      const r = await ledgerStorage.events.hasEvent(
        {blockHeight: 0, type: 'WebLedgerOperationEvent'});
      should.exist(r);
      r.should.be.a('boolean');
      r.should.be.false;
    });
    it('positive result is properly indexed', async () => {
      // this is a covered query
      const r = await ledgerStorage.events.hasEvent(
        {blockHeight: 0, explain: true, type: 'WebLedgerConfigurationEvent'});
      const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage;
      indexName.should.equal('event.consensus.core.1');
      const s = r.executionStats;
      s.nReturned.should.equal(1);
      s.totalKeysExamined.should.equal(1);
      s.totalDocsExamined.should.equal(0);
    });
    it('negative result is properly indexed', async () => {
      // this is a covered query
      const r = await ledgerStorage.events.hasEvent(
        {blockHeight: 0, explain: true, type: 'WebLedgerOperationEvent'});
      const {indexName} = r.queryPlanner.winningPlan.inputStage.inputStage;
      indexName.should.equal('event.consensus.core.1');
      const s = r.executionStats;
      s.nReturned.should.equal(0);
      s.totalKeysExamined.should.equal(0);
      s.totalDocsExamined.should.equal(0);
    });
  });

  describe('update API', () => {
    it('should update event', done => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.creator = `https://example.com/${uuid()}`;
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
      event.ledgerConfiguration.creator = `https://example.com/${uuid()}`;
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
      const eventHash = 'InvalidHash';
      ledgerStorage.events.remove(eventHash, (err, result) => {
        should.exist(err);
        should.not.exist(result);
        err.name.should.equal('NotFoundError');
        done();
      });
    });
  });
});
