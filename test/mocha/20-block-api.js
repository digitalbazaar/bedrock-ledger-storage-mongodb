/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {util: {uuid}} = bedrock;

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

const eventBlockTemplate = bedrock.util.clone(mockData.eventBlocks.alpha);
const opTemplate = mockData.operations.alpha;

describe('Block Storage API', () => {
  let ledgerStorage;

  beforeEach(async () => {
    const block = bedrock.util.clone(configBlockTemplate);
    let meta = {};
    const options = {
      ledgerId: exampleLedgerId, ledgerNodeId: exampleLedgerNodeId
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
    meta.consensus = true;
    meta.consensusDate = Date.now();
    block.blockHeight = 0;
    block.event = [eventHash];
    await ledgerStorage.blocks.add({block, meta});
  }); // end beforeEach

  describe('add API', () => {
    it('should add block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      const result = await ledgerStorage.blocks.add(blocks[0]);
      should.exist(result);
      should.exist(result.block);
      should.exist(result.meta);

      // ensure the block was created in the database
      const {id: blockId} = blocks[0].block;
      const query = {id: database.hash(blockId)};
      const record = await ledgerStorage.blocks.collection.findOne(query);
      should.exist(record);
      should.exist(record.id);
      should.exist(record.block.id);
      should.exist(record.meta.consensus);
    });
    it('should not add duplicate block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);
      // try to add again
      let err;
      try {
        await ledgerStorage.blocks.add(blocks[0]);
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('DuplicateError');
    });
  }); // end add API

  describe('get API', () => {
    it('should get consensus block with given ID', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);
      const block = blocks[0].block;
      const result = await ledgerStorage.blocks.get({blockId: block.id});
      should.exist(result.block);
      should.exist(result.meta);
      result.block.id.should.equal(block.id);
    });
    it('should fail to get non-existent block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      const block = blocks[0].block;
      let result;
      let err;
      try {
        result = await ledgerStorage.blocks.get({blockId: block.id});
      } catch(e) {
        err = e;
      }
      should.not.exist(result);
      should.exist(err);
      err.name.should.equal('NotFoundError');
    });
  }); // end get API

  describe('update API', () => {
    it('should update block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);

      const block = blocks[0].block;
      let {meta} = blocks[0];
      meta = {
        ...meta,
        testArrayOne: ['a', 'b'],
        testArrayTwo: ['a', 'b', 'c', 'z'],
        pending: true
      };
      await ledgerStorage.blocks.add({block, meta});

      // now patch block meta
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}},
        {op: 'set', changes: {meta: {consensus: false}}},
        {op: 'add', changes: {meta: {testArrayOne: 'c'}}},
        {op: 'remove', changes: {meta: {testArrayTwo: 'z'}}}
      ];
      const {blockHash} = meta;
      await ledgerStorage.blocks.update({blockHash, patch});

      const result = await ledgerStorage.blocks.get(
        {blockId: block.id, consensus: false});
      should.exist(result.meta.consensus);
      should.not.exist(result.meta.pending);
      result.meta.consensus.should.be.false;
      result.meta.testArrayOne.should.eql(['a', 'b', 'c']);
      result.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
    });
    it('should fail to update invalid block', async () => {
      const patch = [
        {op: 'unset', changes: {meta: {pending: 1}}}
      ];
      let err;
      try {
        await ledgerStorage.blocks.update({blockHash: 'bogusHash', patch});
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('NotFoundError');
    });
  }); // end update API

  describe('remove API', () => {
    it('should remove block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);

      const {blockHash} = blocks[0].meta;
      await ledgerStorage.blocks.remove(blockHash);
    });
    it('should fail to remove non-existent block', async () => {
      const blockHash = 'INVALID HASH';
      let err;
      try {
        await ledgerStorage.blocks.remove(blockHash);
      } catch(e) {
        err = e;
      }
      should.exist(err);
      err.name.should.equal('NotFoundError');
    });
  }); // end remove API

  describe('getGenesis API', () => {
    it('should get genesis block', async () => {
      const result = await ledgerStorage.blocks.getGenesis();
      should.exist(result.genesisBlock);
      should.exist(result.genesisBlock.block);
      should.exist(result.genesisBlock.meta);
      should.not.exist(result.genesisBlock.block.previousBlock);
      should.not.exist(result.genesisBlock.block.previousBlockHash);
    });
  }); // end getGenesis API

  describe('getLatest API', () => {
    it('should get latest block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);
      const result = await ledgerStorage.blocks.getLatest();
      should.exist(result.eventBlock);
      should.exist(result.eventBlock.meta);
      should.exist(result.eventBlock.block);
      const block = result.eventBlock.block;
      should.exist(block.event);
      block.id.should.equal(block.id);
    });
  }); // end getLatest

  describe('getLatestBlockHeight API', () => {
    it('should get latest block height', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {blocks, events, operations} = await helpers.createBlocks(
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
      const {blocks, events, operations} = await helpers.createBlocks(
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
    it('should get latest block', async () => {
      const blockTemplate = eventBlockTemplate;
      const eventTemplate = mockData.events.alpha;
      const {operations, events, blocks} = await helpers.createBlocks(
        {blockTemplate, eventTemplate, opTemplate});
      await ledgerStorage.operations.addMany({operations});
      await ledgerStorage.events.add(events[0]);
      await ledgerStorage.blocks.add(blocks[0]);

      const result = await ledgerStorage.blocks.getLatestSummary();
      should.exist(result.eventBlock);
      should.exist(result.eventBlock.meta);
      should.exist(result.eventBlock.block);
      const block = result.eventBlock.block;
      should.not.exist(block.event);
      block.id.should.equal(block.id);
    });
  }); // end getLatestSummary
});
