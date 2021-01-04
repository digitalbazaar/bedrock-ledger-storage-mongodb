/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const {util: {uuid}} = bedrock;
const pTimes = require('p-times');

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

let ledgerStorage;
describe('Performance tests', () => {
  before(async () => {
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

  describe('Blocks and Event Operations', () => {
    const blockNum = 1000;
    const eventNum = 10;
    const opNum = 2500;
    const passNum = 10;
    const outstandingEventNum = 250;
    let blocksAndEvents;
    it(`generating ${blockNum} blocks`, async function() {
      this.timeout(320000);
      blocksAndEvents = await helpers.createBlocks({
        blockNum,
        blockTemplate: mockData.eventBlocks.alpha,
        eventNum,
        eventTemplate: mockData.events.alpha,
        opTemplate: mockData.operations.alpha
      });
    });

    it(`operations.add operations`, async function() {
      this.timeout(320000);
      const {operations} = blocksAndEvents;
      console.log(`Adding ${operations.length} operations.`);
      await ledgerStorage.operations.addMany({operations});
    });

    // NOTE: the events added here are referenced in the blocks.add test
    it(`events.add events`, async function() {
      this.timeout(320000);
      console.log(`Adding ${blocksAndEvents.events.length} events.`);
      await Promise.all(blocksAndEvents.events.map(
        e => ledgerStorage.events.add({event: e.event, meta: e.meta})));
    });

    // NOTE: the events referenced in the blocks are stored in events.add
    it(`blocks.add ${blockNum} blocks`, async function() {
      this.timeout(320000);
      await Promise.all(blocksAndEvents.blocks.map(
        ({block, meta}) => ledgerStorage.blocks.add({block, meta})));
    });
    it(`add ${outstandingEventNum} events without consensus`, async function() {
      this.timeout(320000);
      const {operations, events} = await helpers.createEvent({
        consensus: false,
        eventNum: outstandingEventNum,
        eventTemplate: mockData.events.alpha,
        opTemplate: mockData.operations.alpha,
      });
      await ledgerStorage.operations.addMany({operations});
      await Promise.all(events.map(
        ({event, meta}) => ledgerStorage.events.add({event, meta})));
    });
    it(`blocks.getLatestSummary ${opNum} times`, async function() {
      this.timeout(320000);
      await runPasses({
        func: ledgerStorage.blocks.getLatestSummary, api: 'blocks',
        passNum, opNum
      });
    });
    it(`blocks.getLatest ${opNum} times`, async function() {
      this.timeout(320000);
      await runPasses({
        func: ledgerStorage.blocks.getLatest, api: 'blocks', passNum, opNum
      });
    });
    it(`events.getLatestConfig ${opNum} times`, async function() {
      this.timeout(320000);
      await runPasses({
        func: ledgerStorage.events.getLatestConfig, api: 'events',
        passNum, opNum
      });
    });
  });
});

async function runPasses({func, passNum, opNum, api, concurrency = 100}) {
  const passes = [];
  for(let i = 0; i < passNum; ++i) {
    const start = Date.now();
    await pTimes(opNum, () => func.call(ledgerStorage[api]), {concurrency});
    const stop = Date.now();
    passes.push(Math.round(opNum / (stop - start) * 1000));
  }
  console.log('ops/sec passes', passes);
  console.log('average ops/sec', helpers.average(passes));
}
