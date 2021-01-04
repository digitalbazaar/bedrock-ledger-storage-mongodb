/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const mockPlugin = require('./mock.plugin');
const {util: {uuid}} = bedrock;

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
    it('classes are extended on storage add', async () => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      const storage = await blsMongodb.add(meta, options);
      should.exist(storage.operations.plugins.mock.mockQuery);
    });
    it('classes are extended on storage get', async () => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      const storage = await blsMongodb.add(meta, options);
      const {id} = storage;
      const result = await blsMongodb.get(id, {});
      should.exist(result.operations.plugins.mock.mockQuery);
    });
  });
  describe('index API', () => {
    it('plugin adds an index to the operations collection', async () => {
      const meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
      };
      const storage = await blsMongodb.add(meta, options);
      const result = await storage.operations.collection.indexExists(
        'mockIndex');
      result.should.be.true;
    });
  });
  describe('mock record query API', () => {
    let ledgerStorage;

    beforeEach(async () => {
      const block = bedrock.util.clone(configBlockTemplate);
      let meta = {};
      const options = {
        ledgerId: exampleLedgerId(), ledgerNodeId: exampleLedgerNodeId(),
        plugins: ['mock']
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
    }); // end beforeEach

    it('record query returns the proper result', async () => {
      const eventTemplate = mockData.events.alpha;
      let opTemplate = mockData.operations.alpha;
      const concerts = await helpers.addEvent({
        consensus: true, count: 5, eventTemplate, ledgerStorage, opTemplate});
      opTemplate = bedrock.util.clone(mockData.operations.gamma);
      const eventHashes = Object.keys(concerts);
      opTemplate.record.event = concerts[eventHashes[0]]
        .operations[0].operation.record.id;
      const offers = await helpers.addEvent({
        consensus: true, count: 1, eventTemplate, ledgerStorage, opTemplate,
        startBlockHeight: 6
      });
      const concertIds = [
        concerts[eventHashes[0]].operations[0].operation.record.id,
        concerts[eventHashes[1]].operations[0].operation.record.id,
      ];
      // the mockQuery API has been implemented using async/await
      const mockQuery = ledgerStorage.operations.plugins.mock.mockQuery;
      const result = await mockQuery({
        maxBlockHeight: 100,
        query: {
          type: 'Offer',
          event: concertIds,
        }
      });
      should.exist(result);
      result.should.be.an('object');
      should.exist(result.records);
      result.records.should.be.an('array');
      result.records.should.have.length(1);
      const offerEventHashes = Object.keys(offers);
      result.records[0].should.equal(offers[offerEventHashes[0]]
        .operations[0].operation.record.id);
    });
    it('returns NotFoundError when there are no matching records', async () => {
      const eventTemplate = mockData.events.alpha;
      let opTemplate = mockData.operations.alpha;
      const concerts = await helpers.addEvent({
        consensus: true, count: 5, eventTemplate, ledgerStorage, opTemplate
      });
      opTemplate = bedrock.util.clone(mockData.operations.gamma);
      const eventHashes = Object.keys(concerts);
      opTemplate.record.event = concerts[eventHashes[0]]
        .operations[0].operation.record.id;
      await helpers.addEvent({
        consensus: true, count: 1, eventTemplate, ledgerStorage, opTemplate,
        startBlockHeight: 6
      });
      const mockQuery = ledgerStorage.operations.plugins.mock.mockQuery;
      // NOTE: querying for an unknown type
      let result;
      let err;
      try {
        result = await mockQuery({
          maxBlockHeight: 100,
          query: {
            type: 'UnknownType',
          }
        });
      } catch(e) {
        err = e;
      }
      should.exist(err);
      should.not.exist(result);
      should.exist(err.name);
      err.name.should.equal('NotFoundError');
    });
  }); // end query API
});
