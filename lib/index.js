/*!
 * Copyright (c) 2016-2018 Digital Bazaar, Inc. All rights reserved.
 */
/** @module bedrock-ledger-storage-mongodb */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
const async = require('async');
const bedrock = require('bedrock');
const brLedgerNode = require('bedrock-ledger-node');
const database = require('bedrock-mongodb');
const logger = require('./logger');
const {promisify} = require('util');
const uuid = require('uuid/v4');
const {callbackify, BedrockError} = bedrock.util;
const LedgerStorage = require('./LedgerStorage');

require('./config');

// module API
const api = {};
module.exports = api;

const brOpenCollections = promisify(database.openCollections)
const brCreateIndexes = promisify(database.createIndexes);

bedrock.events.on('bedrock-mongodb.ready', async () => {
  await brOpenCollections(['ledger']);
  await brCreateIndexes([{
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
  }]);
});

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
 *
 * @return a Promise that resolves to a LedgerStorage instance.
 */
api.add = callbackify(async (meta = {}, options = {}) => {
  // TODO: break this function up into helpers for better readability
  assert.object(meta, 'meta');
  assert.object(options, 'options');
  assert.string(options.ledgerId, 'options.ledgerId');
  assert.string(options.ledgerNodeId, 'options.ledgerNodeId');
  assert.optionalArrayOfString(options.plugins, 'options.plugins');
  const plugins = options.plugins || [];

  // ensure that all the specified plugins are registered, no NotFoundError
  // and that the plugin type is valid
  for(const pluginName of plugins) {
    const p = brLedgerNode.use(pluginName);
    if(p.type !== 'ledgerStoragePlugin') {
      throw new BedrockError(
        'The specified service plugin must have a type of ' +
        '`ledgerStoragePlugin`.', 'InvalidAccessError',
        {httpStatusCode: 400, public: true, pluginName});
    }
  }

  // generate UUIDs for the ledger storage
  const ledgerUuid = uuid();
  const uuids = {
    ledger: ledgerUuid,
    eventCollection: ledgerUuid + '-event',
    blockCollection: ledgerUuid + '-block',
    operationCollection: ledgerUuid + '-operation'
  };

  // insert the ledger
  const now = Date.now();
  const record = {
    id: 'urn:uuid:' + uuids.ledger,
    ledger: {
      blockCollection: uuids.blockCollection,
      eventCollection: uuids.eventCollection,
      id: 'urn:uuid:' + uuids.ledger,
      ledger: options.ledgerId,
      ledgerNode: options.ledgerNodeId,
      operationCollection: uuids.operationCollection,
      plugins,
    },
    meta: _.defaults(meta, {
      created: now,
      updated: now
    })
  };

  logger.debug('adding ledger: ' + options.ledgerId);

  const insertedRecord = (await database.collections.ledger.insert(
    record, database.writeOptions)).ops[0];

  // open the ledger collections
  const ledgerCollections = [
    uuids.blockCollection,
    uuids.eventCollection,
    uuids.operationCollection
  ];
  await brOpenCollections(ledgerCollections);

  // create indexes on block IDs, event IDs, and deleted flags
  const {blockCollection, eventCollection, operationCollection} = uuids;
  await brCreateIndexes([{
    collection: eventCollection,
    fields: {'meta.eventHash': 1},
    options: {unique: true, background: false}
  }, {
    collection: eventCollection,
    fields: {'meta.consensus': 1, 'event.type': 1, 'meta.blockHeight': 1},
    options: {unique: false, background: false, name: 'eventIndex1'}
  }, {
    collection: eventCollection,
    fields: {'event.type': 1, 'meta.created': 1},
    options: {unique: false, background: false}
  }, {
    collection: eventCollection,
    fields: {'event.type': 1, 'meta.consensusDate': 1},
    options: {unique: false, background: false}
  }, {
    collection: eventCollection,
    fields: {'meta.blockHeight': 1, 'meta.blockOrder': 1},
    options: {sparse: true, unique: false, background: false}
  }, {
    collection: eventCollection,
    fields: {'meta.deleted': 1, 'meta.eventHash': 1},
    options: {unique: true, background: false}
  }, {
    collection: blockCollection,
    fields: {id: 1},
    options: {unique: true, background: false}
  }, {
    collection: blockCollection,
    fields: {'block.type': 1, 'block.blockHeight': 1},
    options: {unique: false, background: false}
  }, {
    collection: blockCollection,
    fields: {'meta.blockHash': 1},
    options: {unique: true, background: false}
  }, {
    collection: blockCollection,
    fields: {'meta.deleted': 1},
    options: {unique: false, background: false}
  }, {
    collection: blockCollection,
    fields: {'meta.consensus': 1, 'block.previousBlockHash': 1},
    options: {unique: true, background: false}
  }, {
    collection: blockCollection,
    fields: {'meta.consensus': 1},
    options: {unique: false, background: false}
  }, {
    collection: blockCollection,
    fields: {'meta.consensusDate': 1},
    options: {unique: false, background: false}
  }, {
    collection: operationCollection,
    fields: {
      'meta.eventHash': 1, 'meta.eventOrder': 1, 'meta.operationHash': 1,
      'meta.deleted': 1,
    },
    options: {unique: true, background: false, name: 'operationIndex1'}
  }, {
    collection: operationCollection,
    fields: {'recordId': 1},
    options: {unique: false, background: false, name: 'operationIndex2'}
  }]);

  // storage plugins add indexes to collections by providing an
  // `expandIndexes` method
  if(plugins.length > 0) {
    const options = {
      createIndexes: brCreateIndexes,
      collections: {blockCollection, eventCollection, operationCollection}
    };
    for(const pluginName of plugins) {
      const {api: pluginApi} = brLedgerNode.use(pluginName);
      if(pluginApi.expandIndexes) {
        await pluginApi.expandIndexes(options);
      }
    }
  }

  const lsOptions = {
    blockCollection: database.collections[blockCollection],
    eventCollection: database.collections[eventCollection],
    ledgerNodeId: options.ledgerNodeId,
    operationCollection: database.collections[operationCollection],
    storageId: 'urn:uuid:' + uuids.ledger
  };
  const ledgerStorage = new LedgerStorage(lsOptions);

  // plugins extend storage classes by providing custom methods
  return await _extendLedgerStorage({ledgerStorage, plugins});
});

/**
 * Retrieves a storage API for performing operations on a ledger.
 *
 * @param storageId - a URI identifying the ledger storage.
 * @param options - a set of options used when retrieving the storage API.
 *
 * @return a Promise that resolves to a LedgerStorage instance.
 */
api.get = callbackify(async (storageId, options = {}) => {
  // find an existing ledger
  const query = {
    id: storageId,
    'meta.deleted': {
      $exists: false
    }
  };
  const record = await database.collections.ledger.findOne(query, {});
  if(!record) {
    throw new BedrockError(
      'A ledger with the given storage ID does not exist.',
      'NotFoundError', {storageId});
  }

  // open the ledger collections
  const {ledger} = record;
  const ledgerCollections = [
    ledger.blockCollection,
    ledger.eventCollection,
    ledger.operationCollection
  ];
  await brOpenCollections(ledgerCollections);

  const lsOptions = {
    blockCollection: database.collections[ledger.blockCollection],
    eventCollection: database.collections[ledger.eventCollection],
    ledgerNodeId: ledger.ledgerNode,
    operationCollection: database.collections[ledger.operationCollection],
    storageId: ledger.id,
  };
  const ledgerStorage = new LedgerStorage(lsOptions);
  const {plugins} = ledger;
  return await _extendLedgerStorage({ledgerStorage, plugins});
});

/**
 * Deletes a ledger storage given a set of options.
 *
 * @param storageId - the URI of the ledger to delete.
 * @param options - a set of options used when deleting the ledger.
 */
api.remove = callbackify(async (storageId, options = {}) => {
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
  const result = await database.collections.ledger.updateOne(filter, update);
  if(result.matchedCount !== 1) {
    throw new BedrockError(
      'Remove ledger storage failed; ledger not found.',
      'NotFoundError', {storageId});
  }
});

/**
 * Gets an iterator that will iterate over all ledgers in
 * the system. The iterator will return a ledgerId that can be
 * passed to the api.get() call to fetch the storage for the
 * associated ledger.
 *
 * @param options - a set of options to use when retrieving the list.
 *
 * @return a Promise that resolves to an iterator that returns ledgerIds.
 */
api.getLedgerIterator = callbackify(async (options = {}) => {
  // find all non-deleted ledgers
  const query = {
    'meta.deleted': {
      $exists: false
    }
  };
  const projection = {
    'ledger.id': 1
  };
  const cursor = await database.collections.ledger.find(query, projection);

  // check to see if there are any results
  let hasNext = false;
  try {
    hasNext = await cursor.hasNext();
  } catch(e) {}

  // create a ledger ID iterator
  const iterator = {
    done: !hasNext
  };
  iterator.next = () => {
    if(iterator.done) {
      return {done: true};
    }
    const promise = cursor.next().then(record => {
      // ensure iterator will have something to iterate over next
      return cursor.hasNext().then(hasNext => {
        iterator.done = !hasNext;
        return api.get(record.ledger.id, options);
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
  return iterator;
});

// NOTE: mutates `ledgerStorage`
function _extendLedgerStorage({ledgerStorage, plugins}) {
  if(plugins.length === 0) {
    return ledgerStorage;
  }
  for(const pluginName of plugins) {
    const {api: pluginApi} = brLedgerNode.use(pluginName);
    if(!pluginApi.storage) {
      // no storage extentions specified
      continue;
    }
    // bind plugin APIs to the storage class instances
    const validStorageApis = _.intersection(
      ['blocks', 'events', 'operations'],
      Object.keys(pluginApi.storage));
    validStorageApis.forEach(type => {
      const p = ledgerStorage[type].plugins[pluginName] = {};
      Object.keys(pluginApi.storage[type]).forEach(method => {
        p[method] = pluginApi.storage[type][method].bind(ledgerStorage[type]);
      });
    });
  }
  return ledgerStorage;
}
