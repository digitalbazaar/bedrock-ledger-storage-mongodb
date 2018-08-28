/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const brIdentity = require('bedrock-identity');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const jsonld = bedrock.jsonld;
const jsigs = require('jsonld-signatures')();
const uuid = require('uuid/v4');

const api = {};
module.exports = api;

// use local JSON-LD processor for checking signatures
jsigs.use('jsonld', jsonld);

// test hashing function
api.testHasher = brLedgerNode.consensus._hasher;

api.addEvent = ({
  consensus = false, count = 1, eventTemplate, ledgerStorage, opTemplate,
  recordId, startBlockHeight = 1
}, callback) => {
  const events = {};
  let operations;
  async.timesSeries(count, (i, callback) => {
    const testEvent = bedrock.util.clone(eventTemplate);
    const operation = bedrock.util.clone(opTemplate);
    const testRecordId = recordId || `https://example.com/event/${uuid()}`;
    if(operation.type === 'CreateWebLedgerRecord') {
      operation.record.id = testRecordId;
    }
    if(operation.type === 'UpdateWebLedgerRecord') {
      operation.recordPatch.target = testRecordId;
    }
    async.auto({
      operationHash: callback => api.testHasher(operation, (err, opHash) => {
        if(err) {
          return callback(err);
        }

        // NOTE: nonce is added here to avoid duplicate errors
        testEvent.nonce = uuid();

        testEvent.operationHash = [opHash];
        callback(null, opHash);
      }),
      eventHash: ['operationHash', (results, callback) => api.testHasher(
        testEvent, callback)],
      operation: ['eventHash', (results, callback) => {
        const {eventHash, operationHash} = results;
        operations = [{
          meta: {eventHash, eventOrder: 0, operationHash},
          operation,
          recordId: database.hash(testRecordId),
        }];
        ledgerStorage.operations.addMany({operations}, callback);
      }],
      event: ['operation', (results, callback) => {
        const {eventHash} = results;
        const meta = {eventHash};
        if(consensus) {
          meta.blockHeight = i + startBlockHeight;
          meta.blockOrder = 0;
          meta.consensus = true;
          meta.consensusDate = Date.now();
        }
        ledgerStorage.events.add(
          {event: testEvent, meta}, (err, result) => {
            if(err) {
              return callback(err);
            }
            // NOTE: operations are added to events object in full here so they
            // may be inspected in tests. This does not represent the event
            // in the database
            result.operations = operations;
            events[result.meta.eventHash] = result;
            callback();
          });
      }]
    }, callback);
  }, err => callback(err, events));
};

api.average = arr => Math.round(arr.reduce((p, c) => p + c, 0) / arr.length);

api.createBlocks = ({
  blockTemplate, eventTemplate, blockNum = 1, eventNum = 1, opTemplate,
  startBlock = 1
}, callback) => {
  const blocks = [];
  const events = [];
  const operations = [];
  const startTime = Date.now();
  async.timesLimit(blockNum, 100, (i, callback) => {
    const block = bedrock.util.clone(blockTemplate);
    block.id = `https://example.com/block/${uuid()}`;
    block.blockHeight = startBlock + i;
    block.previousBlock = uuid();
    block.previousBlockHash = uuid();
    const time = startTime + i;
    const meta = {
      "created": time,
      "updated": time,
      "consensus": true,
      "consensusDate": time
    };
    async.auto({
      events: callback => api.createEvent({
        blockHeight: block.blockHeight, eventTemplate, eventNum, opTemplate
      }, (err, result) => {
        if(err) {
          return callback(err);
        }
        block.eventHash = result.events.map(r => r.meta.eventHash);
        events.push(...result.events);
        operations.push(...result.operations);
        callback(null, result);
      }),
      hash: ['events', (results, callback) => {
        api.testHasher(block, (err, result) => {
          if(err) {
            return callback(err);
          }
          meta.blockHash = result;
          block.event = block.eventHash;
          delete block.eventHash;
          blocks.push({block, meta});
          callback();
        });
      }]
    }, callback);
  }, err => {
    if(err) {
      return callback(err);
    }
    callback(null, {blocks, events, operations});
  });
};

api.createEvent = ({
  blockHeight, eventTemplate, eventNum, consensus = true, opTemplate
}, callback) => {
  const events = [];
  const operation = bedrock.util.clone(opTemplate);
  const operations = [];
  async.timesLimit(eventNum, 100, (blockOrder, callback) => {
    if(operation.type === 'CreateWebLedgerRecord') {
      operation.record.id = `https://example.com/events/${uuid()}`;
    }
    const event = bedrock.util.clone(eventTemplate);
    async.auto({
      opHash: callback => api.testHasher(operation, callback),
      eventHash: ['opHash', (results, callback) => {
        event.operationHash = [results.opHash];
        api.testHasher(event, (err, eventHash) => {
          const meta = {blockHeight, blockOrder, eventHash};
          if(consensus) {
            meta.consensus = true;
            meta.consensusDate = Date.now();
          }
          events.push({event, meta});
          const opMeta = {
            eventHash,
            eventOrder: 0,
            operationHash: [results.opHash],
          };
          operations.push({meta: opMeta, operation});
          callback();
        });
      }]
    }, callback);
  }, err => callback(err, {events, operations}));
};

api.createIdentity = function(userName) {
  const newIdentity = {
    id: 'did:' + uuid(),
    type: 'Identity',
    sysSlug: userName,
    label: userName,
    email: userName + '@bedrock.dev',
    sysPassword: 'password',
    sysPublic: ['label', 'url', 'description'],
    sysResourceRole: [],
    url: 'https://example.com',
    description: userName,
    sysStatus: 'active'
  };
  return newIdentity;
};

api.removeCollection = function(collection, callback) {
  const collectionNames = [collection];
  database.openCollections(collectionNames, () => {
    async.each(collectionNames, function(collectionName, callback) {
      database.collections[collectionName].remove({}, callback);
    }, function(err) {
      callback(err);
    });
  });
};

api.removeCollections = function(callback) {
  const collectionNames = ['identity', 'eventLog'];
  database.openCollections(collectionNames, () => {
    async.each(collectionNames, (collectionName, callback) => {
      database.collections[collectionName].remove({}, callback);
    }, function(err) {
      callback(err);
    });
  });
};

api.prepareDatabase = function(mockData, callback) {
  async.series([
    callback => {
      api.removeCollections(callback);
    },
    callback => {
      insertTestData(mockData, callback);
    }
  ], callback);
};

api.getEventNumber = function(eventId) {
  return Number(eventId.substring(eventId.lastIndexOf('/') + 1));
};

// Insert identities and public keys used for testing into database
function insertTestData(mockData, callback) {
  async.forEachOf(mockData.identities, (identity, key, callback) => {
    brIdentity.insert(null, identity.identity, callback);
  }, err => {
    if(err) {
      if(!database.isDuplicateError(err)) {
        // duplicate error means test data is already loaded
        return callback(err);
      }
    }
    callback();
  }, callback);
}
