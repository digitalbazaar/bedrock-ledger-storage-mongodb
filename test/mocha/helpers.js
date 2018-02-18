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

api.average = arr => Math.round(arr.reduce((p, c) => p + c, 0) / arr.length);

api.createBlocks = (
  {blockTemplate, eventTemplate, blockNum = 1, eventNum = 1}, callback) => {
  const blocks = [];
  const events = [];
  const startTime = Date.now();
  async.timesLimit(blockNum, 100, (i, callback) => {
    const block = bedrock.util.clone(blockTemplate);
    block.id = uuid();
    block.blockHeight = i + 1;
    block.previousBlock = uuid();
    block.previousBlockHash = uuid();
    const time = startTime + i;
    const meta = {
      "blockHash": uuid(),
      "created": time,
      "updated": time,
      "consensus": true,
      "consensusDate": time
    };
    async.auto({
      events: callback => api.createEvent(
        {eventTemplate, eventNum}, (err, result) => {
          if(err) {
            return callback(err);
          }
          // must hash with the real events
          block.event = result.map(e => e.event);
          events.push(...result);
          callback(null, result);
        }),
      hash: ['events', (results, callback) => {
        api.testHasher(block, (err, result) => {
          if(err) {
            return callback(err);
          }
          meta.blockHash = result;
          // block is stored with the eventHashes
          block.event = results.events.map(e => e.meta.eventHash);
          blocks.push({block, meta});
          callback();
        });
      }]
    }, callback);
  }, err => {
    if(err) {
      return callback(err);
    }
    callback(null, {blocks, events});
  });
};

api.createEvent = ({eventTemplate, eventNum, consensus = true}, callback) => {
  const events = [];
  async.timesLimit(eventNum, 100, (i, callback) => {
    const event = bedrock.util.clone(eventTemplate);
    event.id = `https://example.com/events/${uuid()}`;
    api.testHasher(event, (err, result) => {
      const meta = {eventHash: result};
      if(consensus) {
        meta.consensus = true;
        meta.consensusDate = Date.now();
      }
      events.push({event, meta});
      callback();
    });
  }, err => callback(err, events));
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
