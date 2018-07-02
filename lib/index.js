/*!
 * Copyright (c) 2016-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
const async = require('async');
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const injector = new (require('bedrock-injector')).Injector();
const logger = require('./logger');
const uuid = require('uuid/v4');
const {BedrockError} = bedrock.util;
const LedgerBlockStorage = require('./ledgerBlockStorage');
const LedgerEventStorage = require('./ledgerEventStorage');
const LedgerOperationStorage = require('./ledgerOperationStorage');

require('./config');

// module API
const api = {};
module.exports = api;

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback =>
    database.openCollections(['ledger'], callback),
  createIndexes: ['openCollections', (results, callback) =>
    database.createIndexes([{
      collection: 'ledger',
      fields: {id: 1},
      options: {unique: true, background: false}
    }, {
      collection: 'ledger',
      fields: {'block.type': 1, id: 1},
      options: {unique: true, background: false}
    }, {
      collection: 'ledger',
      fields: {'block.previousBlockHash': 1},
      options: {unique: false, background: false}
    }, {
      collection: 'ledger',
      fields: {'meta.deleted': 1},
      options: {unique: false, background: false}
      // TODO: add index for `meta.consensus`
    }], callback)
  ]
}, err => callback(err)));

// register this plugin
bedrock.events.on('bedrock.start', () => {
  brLedgerNode.use('mongodb', {
    type: 'storage',
    api: api
  });
});

/**
 * Create a new ledger storage metadata and a set of options.
 *
 * @param meta the metadata associated with the ledger storage.
 * @param options the set of options used when creating the ledger.
 *          ledgerId the ID of the ledger.
 * @param callback(err, storage) the callback to call when finished.
 *          err an Error if an error occurred, null otherwise
 *          storage the storage to use for the purposes of accessing and
 *            modifying the ledger.
 */
api.add = (meta = {}, options = {}, callback) => {
  assert.object(meta, 'meta');
  assert.object(options, 'options');
  assert.string(options.ledgerId, 'options.ledgerId');
  assert.string(options.ledgerNodeId, 'options.ledgerNodeId');

  async.auto({
    generateUuid: callback => {
      // generate a UUID for the ledger storage
      const ledgerUuid = uuid();
      callback(null, {
        uuid: ledgerUuid,
        eventCollection: ledgerUuid + '-event',
        blockCollection: ledgerUuid + '-block',
        operationCollection: ledgerUuid + '-operation'
      });
    },
    insert: ['generateUuid', (results, callback) => {
      // insert the ledger
      const now = Date.now();
      const record = {
        id: 'urn:uuid:' + results.generateUuid.uuid,
        ledger: {
          blockCollection: results.generateUuid.blockCollection,
          eventCollection: results.generateUuid.eventCollection,
          id: 'urn:uuid:' + results.generateUuid.uuid,
          ledger: options.ledgerId,
          ledgerNode: options.ledgerNodeId,
          operationCollection: results.generateUuid.operationCollection
        },
        meta: _.defaults(meta, {
          created: now,
          updated: now
        })
      };

      logger.debug('adding ledger: ' + options.ledgerId);

      database.collections.ledger.insert(
        record, database.writeOptions, (err, result) => {
          if(err) {
            return callback(err);
          }
          callback(null, result.ops[0]);
        });
    }],
    openLedgerCollections: ['insert', (results, callback) => {
      // open the ledger collections
      const ledgerCollections = [
        results.generateUuid.blockCollection,
        results.generateUuid.eventCollection,
        results.generateUuid.operationCollection
      ];
      database.openCollections(ledgerCollections, callback);
    }],
    createCollectionIndexes: ['openLedgerCollections', (results, callback) => {
      // create indexes on block IDs, event IDs, and deleted flags
      database.createIndexes([{
        collection: results.generateUuid.eventCollection,
        fields: {eventHash: 1},
        options: {unique: true, background: false}
      }, {
        collection: results.generateUuid.eventCollection,
        fields: {'meta.consensus': 1, 'event.type': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.eventCollection,
        fields: {'event.type': 1, 'meta.created': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.eventCollection,
        fields: {'event.type': 1, 'meta.consensusDate': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.eventCollection,
        fields: {'meta.blockHeight': 1, 'meta.blockOrder': 1},
        options: {sparse: true, unique: false, background: false}
      }, {
        collection: results.generateUuid.eventCollection,
        fields: {'meta.deleted': 1, eventHash: 1},
        options: {unique: true, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {id: 1},
        options: {unique: true, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {'block.type': 1, 'block.blockHeight': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {blockHash: 1},
        options: {unique: true, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {'meta.deleted': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {'meta.consensus': 1, 'block.previousBlockHash': 1},
        options: {unique: true, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {'meta.consensus': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.blockCollection,
        fields: {'meta.consensusDate': 1},
        options: {unique: false, background: false}
      }, {
        collection: results.generateUuid.operationCollection,
        fields: {
          'meta.eventHash': 1, 'meta.eventOrder': 1, 'meta.operationHash': 1,
          'meta.deleted': 1,
        },
        options: {unique: true, background: false, name: 'operationIndex1'}
      }, {
        collection: results.generateUuid.operationCollection,
        fields: {'recordId': 1},
        options: {unique: false, background: false, name: 'operationIndex2'}
      }], callback);
    }],
    getLedgerStorage: ['createCollectionIndexes', (results, callback) => {
      const lsOptions = {
        blockCollection:
          database.collections[results.generateUuid.blockCollection],
        eventCollection:
          database.collections[results.generateUuid.eventCollection],
        ledgerNodeId: options.ledgerNodeId,
        operationCollection:
          database.collections[results.generateUuid.operationCollection],
        storageId: 'urn:uuid:' + results.generateUuid.uuid,
      };
      const ledgerStorage = new LedgerStorage(lsOptions);
      callback(null, ledgerStorage);
    }]
  }, (err, results) => {
    callback(err, results.getLedgerStorage);
  });
};

/**
 * Retrieves a storage API for performing operations on a ledger.
 *
 * storageId - a URI identifying the ledger storage.
 * options - a set of options used when retrieving the storage API.
 * callback(err, storage) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   storage - A ledger storage API.
 */
api.get = (storageId, options, callback) => {
  async.auto({
    find: callback => {
      // find an existing ledger
      const query = {
        id: storageId,
        'meta.deleted': {
          $exists: false
        }
      };
      database.collections.ledger.findOne(query, {}, callback);
    },
    openCollections: ['find', (results, callback) => {
      const record = results.find;
      if(!record) {
        return callback(new BedrockError(
          'A ledger with the given storage ID does not exist.',
          'NotFoundError',
          {storageId: storageId}
        ));
      }
      // open the ledger collections
      const ledgerCollections = [
        record.ledger.blockCollection,
        record.ledger.eventCollection,
        record.ledger.operationCollection
      ];
      database.openCollections(ledgerCollections, callback);
    }]
  }, (err, results) => {
    if(err) {
      return callback(err);
    }
    const lsOptions = {
      blockCollection:
        database.collections[results.find.ledger.blockCollection],
      eventCollection:
        database.collections[results.find.ledger.eventCollection],
      ledgerNodeId: results.find.ledger.ledgerNode,
      operationCollection:
        database.collections[results.find.ledger.operationCollection],
      storageId: results.find.ledger.id,
    };
    const ledgerStorage = new LedgerStorage(lsOptions);
    callback(null, ledgerStorage);
  });
};

/**
 * Deletes a ledger storage given a set of options.
 *
 * storageId - the URI of the ledger to delete.
 * options - a set of options used when deleting the ledger.
 * callback(err) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise.
 */
api.remove = (storageId, options, callback) => {
  async.auto({
    update: callback => {
      // find an existing ledger storage
      const filter = {
        id: storageId
      };
      const now = Date.now();
      const update = {
        $set: {
          meta: {
            updated: now,
            deleted: now
          }
        }
      };
      database.collections.ledger.updateOne(filter, update, callback);
    },
    ensureUpdate: ['update', (results, callback) => {
      if(results.update.matchedCount !== 1) {
        return callback(new BedrockError(
          'Delete of ledger storage failed.',
          'LedgerDeleteFailed',
          {storageId: storageId}
        ));
      }
      callback();
    }]
  }, callback);
};

/**
 * Gets an iterator that will iterate over all ledgers in
 * the system. The iterator will return a ledgerId that can be
 * passed to the api.get() call to fetch the storage for the
 * associated ledger.
 *
 * options - a set of options to use when retrieving the list.
 * callback(err, iterator) - the callback to call when finished.
 *   err - An Error if an error occurred, null otherwise
 *   iterator - An iterator that returns ledgerIds
 */
api.getLedgerIterator = function(options, callback) {
  async.auto({
    find: callback => {
      // find all non-deleted ledgers
      const query = {
        'meta.deleted': {
          $exists: false
        }
      };
      const projection = {
        'ledger.id': 1
      };
      database.collections.ledger.find(query, projection, callback);
    },
    hasNext: ['find', (results, callback) => {
      // check to see if there are any results
      results.find.hasNext().then(hasNext => callback(null, hasNext), callback);
    }]
  }, (err, results) => {
    if(err) {
      return callback(err);
    }

    // create a ledger ID iterator
    const iterator = {
      done: !results.hasNext
    };
    iterator.next = () => {
      if(iterator.done) {
        return {done: true};
      }
      const cursor = results.find;
      const promise = cursor.next().then(record => {
        // ensure iterator will have something to iterate over next
        return cursor.hasNext().then(hasNext => {
          iterator.done = !hasNext;
          return new Promise((resolve, reject) => {
            api.get(record.ledger.id, options, (err, ledgerStorage) =>
              err ? reject(err) : resolve(ledgerStorage));
          });
        });
      }).catch(err => {
        iterator.done = true;
        throw err;
      });
      return {value: promise, done: iterator.done};
    };
    iterator[Symbol.iterator] = () => {
      return iterator;
    };

    callback(null, iterator);
  });
};

/**
 * Registers or retrieves a ledger storage plugin.
 *
 * A plugin can be registered to extend the capabilities of the ledger storage
 * subsystem by adding new plugins.
 *
 * @param capabilityName (required) the name of the capability.
 * @param [capabilityValue | callback] either the value of the capability:
 *          type type type of plugin.
 *          api the javascript API for the plugin.
 *        or a callback to use this function as an asynchronous getter.
 */
api.use = (capabilityName, capabilityValue) =>
  injector.use(capabilityName, capabilityValue);

/* LedgerStorage enables the storage and retrieval of ledgers,
 * blocks, and events.
 */
class LedgerStorage {
  constructor(options) {
    this.id = options.storageId;
    this.operations = new LedgerOperationStorage(options);
    options.operationStorage = this.operations;
    this.events = new LedgerEventStorage(options);
    options.eventStorage = this.events;
    this.blocks = new LedgerBlockStorage(options);
    options.blockStorage = this.blocks;
    this.driver = database;
  }
}
