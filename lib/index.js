/*!
 * Ledger storage module.
 *
 * Copyright (c) 2016-2017 Digital Bazaar, Inc. All rights reserved.
 */
const async = require('async');
const bedrock = require('bedrock');
// const brPermission = require('bedrock-permission');
const config = require('bedrock').config;
const database = require('bedrock-mongodb');
const jsigs = require('jsonld-signatures')();
const uuid = require('uuid');
let jsonld = bedrock.jsonld;
let request = require('request');
const BedrockError = bedrock.util.BedrockError;
const LedgerBlockStorage = require('./ledgerBlockStorage').LedgerBlockStorage;
const LedgerEventStorage = require('./ledgerEventStorage').LedgerEventStorage;

require('./config');

// module permissions
const PERMISSIONS = bedrock.config.permission.permissions;

// get logger
const logger = bedrock.loggers.get('app');

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
  openCollections: callback =>
    database.openCollections(['ledger'], callback),
  createIndexes: ['openCollections', (results, callback) =>
    database.createIndexes([{
      collection: 'ledger',
      fields: {id: 1, owner: 1},
      options: {unique: true, background: false}
    }], callback)
  ]
}, err => callback(err)));

/**
 * Create a new ledger given an initial configuration block,
 * block metadata, and a set of options.
 *
 * configBlock - the initial configuration block for the ledger.
 * meta - the metadata associated with the configuration block.
 * options - a set of options used when creating the ledger.
 *   owner - the owner of the ledger (default: none - public ledger)
 * callback(err, storage) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   storage - The storage to use for the purposes of accessing and modifying
 *     the ledger.
 */
api.create = (configBlock, meta, options, callback) => {
  async.auto({
    checkExisting: callback => {
      // ensure that the ledger with the given ID doesn't already exist
      var query = {
        id: database.hash(configBlock.ledger)
      };
      if('owner' in options) {
        query.owner = database.hash(options.owner);
      }
      database.collections.ledger.findOne(query, {}, callback);
    },
    generateUuid: ['checkExisting', (results, callback) => {
      // generate a UUID for the ledger storage
      const record = results.checkExisting;
      if(record) {
        return callback(new BedrockError(
          'A ledger with the given configuration already exists.',
          'LedgerCreationFailed',
          {ledgerId: configBlock.ledger, owner: options.owner}
        ));
      }

      const ledgerUuid = uuid.v4();
      callback(null, {
        uuid: ledgerUuid,
        eventCollection: ledgerUuid + '-event',
        blockCollection: ledgerUuid + '-block'
      });
    }],
    insert: ['generateUuid', (results, callback)  => {
      // insert the ledger
      var now = Date.now();
      var record = {
        id: database.hash(configBlock.ledger),
        ledger: {
          id: configBlock.ledger,
          storageUuid: results.generateUuid.uuid,
          eventCollection: results.generateUuid.eventCollection,
          blockCollection: results.generateUuid.blockCollection
        },
        meta: {
          created: now,
          updated: now
        },
      };

      if(options.owner) {
        record.owner = database.hash(options.owner);
        record.ledger.owner = options.owner;
      }

      logger.debug('adding ledger', configBlock.ledger);

      database.collections.ledger.insert(
        record, database.writeOptions, function(err, result) {
          if(err) {
            return callback(err);
          }
          callback(null, result.ops[0]);
      });
    }],
    openLedgerCollections: ['insert', (results, callback)  => {
      // open the ledger collections
      const ledgerCollections = [
        results.generateUuid.eventCollection,
        results.generateUuid.blockCollection
      ];
      database.openCollections(ledgerCollections, callback);
    }],
    openLedgerCollections: ['insert', (results, callback)  => {
      // FIXME: Implement writing the initial config block?
      callback();
    }]
  }, function(err, results) {
    const ledgerStorage = new LedgerStorage(
      results.generateUuid.eventCollection.uuid,
      database.collections[results.generateUuid.eventCollection],
      database.collections[results.generateUuid.blockCollection]);
    callback(err, ledgerStorage);
  });
};

/**
 * Retrieves a storage API for performing operations on a ledger.
 *
 * ledgerId - a URI identifying the ledger.
 * options - a set of options used when retrieving the storage API.
 *   owner (optional) - the owner of the ledger
 * callback(err, storage) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   storage - A ledger storage API.
 */
api.get = (ledgerId, options, callback) => {
  async.auto({
    find: callback => {
      // find an existing ledger
      var query = {
        id: database.hash(ledgerId)
      };
      if('owner' in options) {
        query.owner = database.hash(options.owner);
      }
      database.collections.ledger.findOne(query, {}, callback);
    },
    openCollections: ['find', (results, callback) => {
      const record = results.find;
      if(!record) {
        return callback(new BedrockError(
          'A ledger with the given configuration does not exist.',
          'LedgerDoesNotExist',
          {ledgerId: ledgerId, owner: options.owner}
        ));
      }
      // open the ledger collections
      const ledgerCollections = [
        record.ledger.eventCollection,
        record.ledger.blockCollection
      ];
      database.openCollections(ledgerCollections, callback);
    }]
  }, function(err, results) {
    if(err) {
      return callback(err);
    }
    const ledgerStorage = new LedgerStorage(
      results.find.ledger.storageUuid,
      database.collections[results.find.ledger.eventCollection],
      database.collections[results.find.ledger.blockCollection]);
    callback(null, ledgerStorage);
  });
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
  callback();
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
  callback(null, yield* [
    'did:v1:049f7d7a-6327-41db-b2cf-9ffa29d3433b',
    'did:v1:40454763-c925-459d-9b1b-8fb5869eca6b',
    'did:v1:b464dfe5-b0ad-407f-9d36-72e04de8572e',
  ]);
};

/* LedgerStorage enables the storage and retrieval of ledgers,
 * blocks, and events.
 */
class LedgerStorage {
  constructor(storageUuid, blockCollection, eventCollection) {
    this.storageUuid = storageUuid;
    this.blocks = new LedgerBlockStorage(blockCollection);
    this.events = new LedgerEventStorage(eventCollection);
    this.driver = database;
  }
}
