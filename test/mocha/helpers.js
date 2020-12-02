/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const {promisify} = require('util');
const {util: {uuid}} = bedrock;

const api = {};
module.exports = api;

// test hashing function
api.testHasher = brLedgerNode.consensus._hasher;

api.addEvent = async ({
  consensus = false, count = 1, eventTemplate, ledgerStorage, opTemplate,
  recordId, startBlockHeight = 1
}) => {
  const events = {};
  let operations;
  for(let i = 0; i < count; ++i) {
    const testEvent = bedrock.util.clone(eventTemplate);
    const operation = bedrock.util.clone(opTemplate);
    const testRecordId = recordId || `https://example.com/event/${uuid()}`;
    if(operation.type === 'CreateWebLedgerRecord') {
      operation.record.id = testRecordId;
    }
    if(operation.type === 'UpdateWebLedgerRecord') {
      operation.recordPatch.target = testRecordId;
    }
    const operationHash = await api.testHasher(operation);
    // NOTE: nonce is added here to avoid duplicate errors
    testEvent.nonce = uuid();
    testEvent.operationHash = [operationHash];
    const eventHash = await api.testHasher(testEvent);
    operations = [{
      meta: {eventHash, eventOrder: 0, operationHash},
      operation,
      recordId: database.hash(testRecordId),
    }];
    await ledgerStorage.operations.addMany({operations});

    const meta = {eventHash};
    if(consensus) {
      meta.blockHeight = i + startBlockHeight;
      meta.blockOrder = 0;
      meta.consensus = true;
      meta.consensusDate = Date.now();
    }
    const result = await ledgerStorage.events.add(
      {event: testEvent, meta});
    // NOTE: operations are added to events object in full here so they
    // may be inspected in tests. This does not represent the event
    // in the database
    result.operations = operations;
    events[result.meta.eventHash] = result;
  }
  return events;
};

api.average = arr => Math.round(arr.reduce((p, c) => p + c, 0) / arr.length);

api.createBlocks = async ({
  blockTemplate, eventTemplate, blockNum = 1, eventNum = 1, opTemplate,
  startBlock = 1
}) => {
  const blocks = [];
  const events = [];
  const operations = [];
  const startTime = Date.now();
  for(let i = 0; i < blockNum; ++i) {
    const block = bedrock.util.clone(blockTemplate);
    block.id = `https://example.com/block/${uuid()}`;
    block.blockHeight = startBlock + i;
    block.previousBlock = uuid();
    block.previousBlockHash = uuid();
    const time = startTime + i;
    const meta = {
      created: time,
      updated: time,
      consensus: true,
      consensusDate: time
    };
    const result = await api.createEvent({
      blockHeight: block.blockHeight, eventTemplate, eventNum, opTemplate});
    block.eventHash = result.events.map(r => r.meta.eventHash);
    events.push(...result.events);
    operations.push(...result.operations);
    meta.blockHash = await api.testHasher(block);
    block.event = block.eventHash;
    delete block.eventHash;
    blocks.push({block, meta});
  }
  return {blocks, events, operations};
};

api.createEvent = async ({
  blockHeight, eventTemplate, eventNum, consensus = true, opTemplate
}) => {
  const events = [];
  const operation = bedrock.util.clone(opTemplate);
  const operations = [];
  for(let blockOrder = 0; blockOrder < eventNum; ++blockOrder) {
    if(operation.type === 'CreateWebLedgerRecord') {
      operation.record.id = `https://example.com/events/${uuid()}`;
    }
    const event = bedrock.util.clone(eventTemplate);
    const operationHash = await api.testHasher(operation);
    event.operationHash = [operationHash];
    const eventHash = await api.testHasher(event);
    const meta = {blockHeight, blockOrder, eventHash};
    if(consensus) {
      meta.consensus = true;
      meta.consensusDate = Date.now();
    }
    events.push({event, meta});
    const opMeta = {
      eventHash,
      eventOrder: 0,
      operationHash: [operationHash],
    };
    operations.push({meta: opMeta, operation});
  }
  return {events, operations};
};

api.removeCollections = async function(collections = []) {
  const collectionNames = [].concat(collections);
  await database.openCollections(collectionNames);
  for(const collectionName of collectionNames) {
    await database.collections[collectionName].deleteMany({});
  }
};

api.prepareDatabase = async function() {
  await api.removeCollections(['ledger', 'ledgerNode', 'eventLog']);
};

api.getEventNumber = function(eventId) {
  return Number(eventId.substring(eventId.lastIndexOf('/') + 1));
};
