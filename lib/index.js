/*!
 * Ledger storage module.
 *
 * Copyright (c) 2016-2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
// const brPermission = require('bedrock-permission');
const config = require('bedrock').config;
const crypto = require('crypto');
const database = require('bedrock-mongodb');
const jsigs = require('jsonld-signatures')();
let jsonld = bedrock.jsonld;
let request = require('request');
const BedrockError = bedrock.util.BedrockError;
const LedgerBlockStorage = require('./ledgerBlockStorage').LedgerBlockStorage;
const LedgerEventStorage = require('./ledgerEventStorage').LedgerEventStorage;

require('./config');

// module permissions
const PERMISSIONS = bedrock.config.permission.permissions;

// module API
const api = {};
module.exports = api;

// const logger = bedrock.loggers.get('app');

// ensure that requests always send JSON
request = request.defaults({json: true});

// FIXME: Do not use an insecure document loader in production
// jsonld = jsonld();
const nodeDocumentLoader = jsonld.documentLoaders.node({
  secure: false,
  strictSSL: false
});
jsonld.documentLoader = (url, callback) => {
  if(url in config.constants.CONTEXTS) {
    return callback(
      null, {
        contextUrl: null,
        document: config.constants.CONTEXTS[url],
        documentUrl: url
      });
  }
  nodeDocumentLoader(url, callback);
};

// use local JSON-LD processor for checking signatures
jsigs.use('jsonld', jsonld);

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback => database.openCollections(['ledger'], callback),
  createIndexes: ['openCollections', (results, callback) =>
    database.createIndexes([{
      collection: 'ledger',
      fields: {id: 1},
      options: {unique: true, background: false}
    }], callback)
  ],
  createKeys: ['createIndexes', (results, callback) => {
    // FIXME: open all existing ledgers
    callback();
  }]
}, err => callback(err)));

/**
 * Create a new ledger given an initial configuration block,
 * block metadata, and a set of options.
 *
 * actor - the actor performing the action.
 * configBlock - the initial configuration block for the ledger.
 * meta - the metadata associated with the configuration block.
 * options - a set of options used when creating the ledger.
 * callback(err, storage) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   storage - The storage to use for the purposes of accessing and modifying the ledger.
 */
api.create = (actor, configBlock, meta, options, callback) => {
  // FIXME: Implement
  return new LedgerStorage(configBlock.ledger);
};

/**
 * Retrieves a storage API for performing operations on a ledger.
 *
 * actor - the actor performing the action.
 * ledgerId - a URI identifying the ledger.
 * options - a set of options used when retrieving the storage API.
 * callback(err, storage) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   storage - A ledger storage API.
 */
api.get = (actor, ledgerId, options, callback) => {
  // FIXME: Implement
  return new LedgerStorage(ledgerId);
};

/**
 * Deletes a ledger given a set of options.
 *
 * actor - the actor performing the action.
 * ledgerId - the URI of the ledger to delete.
 * options - a set of options used when deleting the ledger.
 * callback(err) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise.
 */
api.delete = (actor, ledgerId, options, callback) => {
  // FIXME: Implement
  return new LedgerStorage(ledgerId);
};

/**
 * Gets an iterator that will iterate over all ledgers in
 * the system. The iterator will return a ledgerId that can be
 * passed to the api.get() call to fetch the storage for the
 * associated ledger.
 *
 * actor - the actor performing the action.
 * options - a set of options to use when retrieving the list.
 * callback(err, iterator) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   iterator - An iterator that returns ledgerIds
 */
api.getLedgerIterator = function*(actor, options, callback) {
  // FIXME: Implement
  return yield* [
    'did:v1:049f7d7a-6327-41db-b2cf-9ffa29d3433b',
    'did:v1:40454763-c925-459d-9b1b-8fb5869eca6b',
    'did:v1:b464dfe5-b0ad-407f-9d36-72e04de8572e',
  ];
};

/* LedgerStorage enables the storage and retrieval of ledgers,
 * blocks, and events.
 */
class LedgerStorage {
  constructor(ledgerId) {
    this.blocks = new LedgerBlockStorage(ledgerId);
    this.events = new LedgerEventStorage(ledgerId);
    this.driver = {};
  }
}
