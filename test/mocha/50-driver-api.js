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
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Ledger Storage Driver API', () => {
  let ledgerStorage;

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
      eventHash
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
  it('should be able to retrieve the driver', async () => {
    should.exist(ledgerStorage.driver);
  });
  it('should be able to perform a query', async () => {
    const query = {
      'ledger.id': ledgerStorage.id
    };
    const result = await ledgerStorage.driver.collections.ledger.findOne(query);
    result.ledger.id.should.equal(ledgerStorage.id);
  });
  it('should be able to perform a write', async () => {
    const filter = {
      'ledger.id': ledgerStorage.id
    };
    const update = {
      $set: {
        meta: {
          test: true
        }
      }
    };
    const lc = ledgerStorage.driver.collections.ledger;
    const result = await lc.updateOne(filter, update);
    result.matchedCount.should.equal(1);
  });
});
