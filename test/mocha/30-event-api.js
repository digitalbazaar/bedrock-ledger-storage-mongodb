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
configEventTemplate.ledgerConfiguration.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Event Storage API', () => {
  let ledgerStorage;

  beforeEach(async () => {
    const block = bedrock.util.clone(configBlockTemplate);
    let meta = {};
    const options = {
      ledgerId: exampleLedgerId,
      ledgerNodeId: exampleLedgerNodeId,
    };

    ledgerStorage = await blsMongodb.add(meta, options);
    const eventHash = await helpers.testHasher(configEventTemplate);
    const blockHash = await helpers.testHasher(block);

    meta = {
      blockHeight: 0,
      blockOrder: 0,
      consensus: true,
      consensusDate: Date.now(),
      eventHash,
      effectiveConfiguration: true
    };
    await ledgerStorage.events.add({event: configEventTemplate, meta});

    // blockHash and consensus are normally created by consensus plugin
    meta.blockHash = blockHash;
    meta.consensus = Date.now();
    block.blockHeight = 0;
    block.event = [eventHash];
    await ledgerStorage.blocks.add({block, meta});
  });
  beforeEach(async () => {
    // FIXME: Remove ledger
  });
  describe('add API', () => {
    it('should add event', async () => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      const operationHash = await helpers.testHasher(operation);
      testEvent.operationHash = [operationHash];
      const eventHash = await helpers.testHasher(testEvent);
      const operations = [{
        meta: {eventHash, eventOrder: 0, operationHash},
        operation,
      }];
      await ledgerStorage.operations.addMany({operations});
      meta.eventHash = eventHash;
      const result = await ledgerStorage.events.add({event: testEvent, meta});
      should.exist(result);
      should.exist(result.event);
      should.exist(result.meta);

      // ensure the event was created in the database
      const query = {'meta.eventHash': result.meta.eventHash};
      const record = await ledgerStorage.events.collection.findOne(query);
      should.exist(record);
      should.exist(record.meta);
      should.exist(record.meta.eventHash);
    });
    it('returns InvalidStateError if ops not properly associated', async () => {
      const testEvent = bedrock.util.clone(mockData.events.alpha);
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = `https://example.com/event/${uuid()}`;
      const meta = {};
      const operationHash = await helpers.testHasher(operation);
      testEvent.operationHash = [operationHash];
      const eventHash = await helpers.testHasher(testEvent);
      meta.eventHash = eventHash;
      let result;
      let err;
      try {
        result = await ledgerStorage.events.add({event: testEvent, meta});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('InvalidStateError');
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
    it('returns error if `operationHash` is missing', async () => {
      const event = bedrock.util.clone(mockData.events.alpha);
      const meta = {};
      const eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      let result;
      let err;
      try {
        result = await ledgerStorage.events.add({event, meta});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('DataError');
    });
    it('should not add duplicate event', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      const meta = {consensus: false};
      const eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      let result;
      let err;
      try {
        result = await ledgerStorage.events.add({event, meta});
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      should.exist(err);
      err.name.should.equal('DuplicateError');
    });
  }); // end add API
  describe('addMany API', () => {
    it('should add many events', async () => {
      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        const operation = bedrock.util.clone(mockData.operations.alpha);
        operation.record.id = `https://example.com/event/${uuid()}`;
        const operationHash = await helpers.testHasher(operation);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const operations = results.map(
        ({operation, operationHash, eventHash}) => ({
          operation,
          meta: {eventHash, eventOrder: 0, operationHash}
        }));
      const events = results.map(({event, eventHash}) => ({
        event,
        meta: {consensus: false, eventHash}
      }));
      await ledgerStorage.operations.addMany({operations});
      const result = await ledgerStorage.events.addMany({events});
      should.exist(result);
      should.exist(result.dupHashes);
      result.dupHashes.should.be.an('array');
      result.dupHashes.length.should.equal(0);
      // ensure the event was created in the database
      const records = await ledgerStorage.events.collection.find({}).toArray();
      should.exist(records);
      records.should.be.an('array');
      // there is one extra event added in a before block
      records.length.should.equal(events.length + 1);
      const eventHashes = records.map(r => r.meta.eventHash);
      for(const e of events) {
        // ensure each event was written to the database
        eventHashes.should.include(e.meta.eventHash);
      }
      // filter out duplicate eventHashes
      const uniqueEvents = new Set(eventHashes);
      // this ensures that we do not have duplicate eventHashes
      uniqueEvents.size.should.equal(eventHashes.length);
    });
    it('should insert non-duplicate events', async () => {
      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        const operation = bedrock.util.clone(mockData.operations.alpha);
        operation.record.id = `https://example.com/event/${uuid()}`;
        const operationHash = await helpers.testHasher(operation);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const operations = results.map(
        ({operation, operationHash, eventHash}) => ({
          operation,
          meta: {eventHash, eventOrder: 0, operationHash}
        }));
      const events = results.map(({event, eventHash}) => ({
        event,
        meta: {consensus: false, eventHash}
      }));
      // add a duplicate event in the middle
      events[Math.floor(events.length / 2)] = events[0];

      await ledgerStorage.operations.addMany({operations});
      const result = await ledgerStorage.events.addMany({events});
      should.exist(result);
      should.exist(result.dupHashes);
      result.dupHashes.should.be.an('array');
      // we should get one duplicate hash
      result.dupHashes.length.should.equal(1);
      // the duplicate should be the first event
      result.dupHashes.should.include(events[0].meta.eventHash);
      // ensure the event was created in the database
      const records = await ledgerStorage.events.collection.find({}).toArray();
      should.exist(records);
      records.should.be.an('array');
      // there is one extra event added in a before block
      // so we should have 5 records here
      records.length.should.equal(events.length);
      const eventHashes = records.map(r => r.meta.eventHash);
      for(const e of events) {
        //ensure each event was written to the database
        eventHashes.should.include(e.meta.eventHash);
      }
      // filter out duplicate eventHashes
      const uniqueEvents = new Set(eventHashes);
      // this ensures that we do not have duplicate eventHashes
      uniqueEvents.size.should.equal(eventHashes.length);
    });
    it('should add events even if first event is a duplicate', async () => {
      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        const operation = bedrock.util.clone(mockData.operations.alpha);
        operation.record.id = `https://example.com/event/${uuid()}`;
        const operationHash = await helpers.testHasher(operation);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const operations = results.map(
        ({operation, operationHash, eventHash}) => ({
          operation,
          meta: {eventHash, eventOrder: 0, operationHash}
        }));
      const events = results.map(({event, eventHash}) => ({
        event,
        meta: {consensus: false, eventHash}
      }));

      await ledgerStorage.operations.addMany({operations});

      // add duplicate event as first event
      const {event, meta} = events[0];
      await ledgerStorage.events.add({event, meta});

      const result = await ledgerStorage.events.addMany({events});
      should.exist(result);
      should.exist(result.dupHashes);
      result.dupHashes.should.be.an('array');
      result.dupHashes.length.should.equal(1);
      // the duplicate should be the first event
      result.dupHashes.should.include(events[0].meta.eventHash);
      // ensure the event was created in the database
      const records = await ledgerStorage.events.collection.find({}).toArray();
      should.exist(records);
      records.should.be.an('array');
      // there is one extra event added in a before block
      records.length.should.equal(events.length + 1);
      const eventHashes = records.map(r => r.meta.eventHash);
      for(const e of events) {
        //ensure each event was written to the database
        eventHashes.should.include(e.meta.eventHash);
      }
      // filter out duplicate eventHashes
      const uniqueEvents = new Set(eventHashes);
      // this ensures that we do not have duplicate eventHashes
      uniqueEvents.size.should.equal(eventHashes.length);
    });

    it('should add events even if last event is a duplicate', async () => {
      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        const operation = bedrock.util.clone(mockData.operations.alpha);
        operation.record.id = `https://example.com/event/${uuid()}`;
        const operationHash = await helpers.testHasher(operation);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const operations = results.map(
        ({operation, operationHash, eventHash}) => ({
          operation,
          meta: {eventHash, eventOrder: 0, operationHash}
        }));
      const events = results.map(({event, eventHash}) => ({
        event,
        meta: {consensus: false, eventHash}
      }));

      await ledgerStorage.operations.addMany({operations});

      // add duplicate event as last event
      const {event, meta} = events[events.length - 1];
      await ledgerStorage.events.add({event, meta});

      const result = await ledgerStorage.events.addMany({events});
      should.exist(result);
      should.exist(result.dupHashes);
      result.dupHashes.should.be.an('array');
      result.dupHashes.length.should.equal(1);
      // the duplicate should be the first event
      result.dupHashes.should.include(
        events[events.length - 1].meta.eventHash);
      // ensure the event was created in the database
      const records = await ledgerStorage.events.collection.find({}).toArray();
      should.exist(records);
      records.should.be.an('array');
      // there is one extra event added in a before block
      records.length.should.equal(events.length + 1);
      const eventHashes = records.map(r => r.meta.eventHash);
      for(const e of events) {
        //ensure each event was written to the database
        eventHashes.should.include(e.meta.eventHash);
      }
      // filter out duplicate eventHashes
      const uniqueEvents = new Set(eventHashes);
      // this ensures that we do not have duplicate eventHashes
      uniqueEvents.size.should.equal(eventHashes.length);
    });
    it('throws TypeError if `meta` is omitted', async () => {
      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        const operation = bedrock.util.clone(mockData.operations.alpha);
        operation.record.id = `https://example.com/event/${uuid()}`;
        const operationHash = await helpers.testHasher(operation);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const events = results.map(({event}) => ({event}));
      let result;
      let err;
      try {
        result = await ledgerStorage.events.addMany({events});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('TypeError');
    });
    it('should not throw on duplicate event', async () => {
      const operation = bedrock.util.clone(mockData.operations.alpha);
      operation.record.id = 'https://example.com/event/duplicate';
      const operationHash = await helpers.testHasher(operation);

      const results = [];
      for(let i = 0; i < 5; ++i) {
        const testEvent = bedrock.util.clone(mockData.events.alpha);
        testEvent.operationHash = [operationHash];
        const eventHash = await helpers.testHasher(testEvent);
        results.push({event: testEvent, operationHash, eventHash, operation});
      }
      const events = results.map(({event, eventHash}) => ({
        event,
        meta: {eventHash}
      }));
      const result = await ledgerStorage.events.addMany({events});
      should.exist(result);
      should.exist(result.dupHashes);
      result.dupHashes.should.be.an('array');
      // every event after the first one should have thrown
      // a duplicate record error
      result.dupHashes.length.should.equal(events.length - 1);
      // ensure the event was created in the database
      const records = await ledgerStorage.events.collection.find({}).toArray();
      should.exist(records);
      records.should.be.an('array');
      records.length.should.equal(2);
      const eventHashes = records.map(r => r.meta.eventHash);
      eventHashes.should.include(events[0].meta.eventHash);
    });
  }); // end addMany API

  describe('difference API', () => {
    it('returns eventHashes for events that are not in storage', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const fakeEvents = [];
      const fakeHashes = [];
      for(let i = 0; i < 5; ++i) {
        const event = bedrock.util.clone(mockData.events.alpha);
        event.operationHash = ['urn:uuid:' + uuid()];
        fakeEvents.push(event);
        fakeHashes.push(await helpers.testHasher(event));
      }
      const events = await helpers.addEvent(
        {count: 2, eventTemplate, ledgerStorage, opTemplate});
      const realHashes = Object.keys(events);
      const allHashes = [...fakeHashes, ...realHashes];
      const result = await ledgerStorage.events.difference(allHashes);
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(5);
      result.should.have.same.members(fakeHashes);
    });
    it('returns empty array if all the events are in storage', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const events = await helpers.addEvent(
        {count: 5, eventTemplate, ledgerStorage, opTemplate});
      const realHashes = Object.keys(events);
      const allHashes = [...realHashes];
      const result = await ledgerStorage.events.difference(allHashes);
      should.exist(result);
      result.should.be.an('array');
      result.should.have.length(0);
    });
  }); // end difference API

  describe('exists API', function() {
    it('returns true if an event exists', async () => {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const events = await helpers.addEvent(
        {eventTemplate, ledgerStorage, opTemplate});
      const eventHash = Object.keys(events)[0];
      const result = await ledgerStorage.events.exists(eventHash);
      result.should.be.true;
    });
    it('returns true if multiple events exist', async function() {
      const eventTemplate = mockData.events.alpha;
      const opTemplate = mockData.operations.alpha;
      const events = await helpers.addEvent(
        {count: 5, eventTemplate, ledgerStorage, opTemplate});
      const eventHash = Object.keys(events);
      const result = await ledgerStorage.events.exists(eventHash);
      result.should.be.true;
    });
    it('returns false if an event does not exist', async () => {
      const result = await ledgerStorage.events.exists('unknownHash');
      result.should.be.false;
    });
  }); // end exists API

  describe('get API', () => {
    it('should get event with given hash', async () => {
      // calculate the hash of the genesis configuration at get the event
      const event = bedrock.util.clone(configEventTemplate);
      const eventHash = await helpers.testHasher(event);
      const result = await ledgerStorage.events.get(eventHash);
      result.event.should.eql(event);
      result.meta.eventHash.should.equal(eventHash);
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
    it('should get the effective config for given blockHeight', async () => {
      const eventAlpha = bedrock.util.clone(configEventTemplate);
      eventAlpha.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const eventBeta = bedrock.util.clone(configEventTemplate);
      eventBeta.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      const meta = {effectiveConfiguration: true};
      const hashAlpha = await helpers.testHasher(eventAlpha);
      const hashBeta = await helpers.testHasher(eventBeta);
      // add alpha
      {
        const _meta = {...meta};
        _meta.eventHash = hashAlpha;
        _meta.blockHeight = 20;
        _meta.consensus = true;
        _meta.consensusDate = Date.now();
        await ledgerStorage.events.add({event: eventAlpha, meta: _meta});
      }
      // add beta
      {
        const _meta = {...meta};
        _meta.eventHash = hashBeta;
        _meta.blockHeight = 30;
        _meta.consensus = true;
        _meta.consensusDate = Date.now();
        await ledgerStorage.events.add({event: eventBeta, meta: _meta});
      }
      const latest = await ledgerStorage.events.getLatestConfig();
      should.exist(latest);
      latest.event.should.eql(eventBeta);

      // get before block height
      // specifying the blockHeight for the beta config
      const result = await ledgerStorage.events.getEffectiveConfig(
        {blockHeight: 30});
      should.exist(result);
      result.event.should.eql(eventAlpha);
    });
    it('returns NotFoundError when there is no configuration', async () => {
      const meta = {};
      const options = {
        ledgerId: `urn:${uuid()}`,
        ledgerNodeId: `urn:uuid:${uuid()}`
      };
      const ledgerStorage = await blsMongodb.add(meta, options);
      let result;
      let err;
      try {
        result = await ledgerStorage.events.getEffectiveConfig(
          {blockHeight: 10});
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
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
    it('should get latest valid config event', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.consensusMethod = `urn:${uuid()}`;
      event.ledgerConfiguration.sequence = 1;
      const meta = {};
      const eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      meta.blockHeight = 10000000;
      meta.consensus = true;
      meta.consensusDate = Date.now();
      meta.effectiveConfiguration = true;
      await ledgerStorage.events.add({event, meta});
      const configEvent = await ledgerStorage.events.getLatestConfig();
      configEvent.event.should.deep.equal(event);
    });
    it('returns NotFoundError when there is no configuration', async () => {
      const meta = {};
      const options = {
        ledgerId: `urn:${uuid()}`,
        ledgerNodeId: `urn:uuid:${uuid()}`
      };
      const ledgerStorage = await blsMongodb.add(meta, options);
      let result;
      let err;
      try {
        result = await ledgerStorage.events.getLatestConfig();
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
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
    it('should update event', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.creator = `https://example.com/${uuid()}`;
      const meta = {
        testArrayOne: ['a', 'b'],
        testArrayTwo: ['a', 'b', 'c', 'z'],
        pending: true
      };
      // create the block
      const eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      await ledgerStorage.events.add({event, meta});

      // patch the event
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}},
        {op: 'set', changes: {meta: {consensus: Date.now()}}},
        {op: 'add', changes: {meta: {testArrayOne: 'c'}}},
        {op: 'remove', changes: {meta: {testArrayTwo: 'z'}}}
      ];

      await ledgerStorage.events.update({eventHash, patch});
      const result = await ledgerStorage.events.get(eventHash);
      should.exist(result.meta.consensus);
      should.not.exist(result.meta.pending);
      result.meta.testArrayOne.should.eql(['a', 'b', 'c']);
      result.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
    });
    it('should fail to update invalid event', async () => {
      const eventHash = 'ni:///sha-256;INVALID';
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}}
      ];
      let result;
      let err;
      try {
        result = await ledgerStorage.events.update({eventHash, patch});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
    });
  });

  describe('updateMany API', () => {
    let events;

    beforeEach(async () => {
      const count = 50;
      events = [];
      for(let i = 0; i < count; i++) {
        const event = bedrock.util.clone(configEventTemplate);
        event.ledgerConfiguration.creator = `https://example.com/${uuid()}`;
        const meta = {
          pending: true
        };
        // create the block
        const eventHash = await helpers.testHasher(event);
        meta.eventHash = eventHash;
        events.push({
          event,
          meta
        });
      }

      await Promise.all(events.map(event => ledgerStorage.events.add(event)));
    });

    it('should update many events', async () => {
      // patch the event
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}},
        {op: 'set', changes: {meta: {consensus: Date.now()}}}
      ];

      const eventUpdates = events.map(({meta}) => ({
        eventHash: meta.eventHash, patch
      }));

      await ledgerStorage.events.updateMany({events: eventUpdates});
      for(const event of events) {
        const {eventHash} = event.meta;
        const result = await ledgerStorage.events.get(eventHash);
        should.exist(result.meta.consensus);
        should.not.exist(result.meta.pending);
      }
    });
    it('should fail to update many invalid events', async () => {
      // patch the event
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}},
        {op: 'set', changes: {meta: {consensus: Date.now()}}}
      ];

      const eventUpdates = events.map(({meta}) => ({
        eventHash: meta.eventHash, patch
      }));

      // add bad event
      eventUpdates.push({
        eventHash: 'ni:///sha-256;INVALID',
        patch: [
          {op: 'unset', changes: {meta: {pending: 1}}}
        ]
      });

      let result;
      let err;
      try {
        result = await ledgerStorage.events.updateMany({events: eventUpdates});
      } catch(e) {
        err = e;
      }

      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('OperationError');
    });
  });

  describe('remove API', () => {
    it('should remove event', async () => {
      const event = bedrock.util.clone(configEventTemplate);
      event.ledgerConfiguration.creator = `https://example.com/${uuid()}`;
      const meta = {};
      // create the event
      const eventHash = await helpers.testHasher(event);
      meta.eventHash = eventHash;
      await ledgerStorage.events.add({event, meta});
      await ledgerStorage.events.remove(eventHash);
    });
    it('should fail to remove non-existent event', async () => {
      const eventHash = 'InvalidHash';
      let result;
      let err;
      try {
        result = await ledgerStorage.events.remove(eventHash);
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      err.name.should.equal('NotFoundError');
    });
  });
});
