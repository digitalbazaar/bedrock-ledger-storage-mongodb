/*!
 * Ledger event storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const jsonld = bedrock.jsonld;
const logger = require('./logger');
const {BedrockError} = bedrock.util;

// TODO: ideally, code to create indexes for event storage would be in
// this file

/**
 * The events API is used to perform operations on events associated
 * with a particular ledger.
 */
module.exports = class LedgerEventStorage {
  constructor({eventCollection, ledgerNodeId, operationStorage}) {
    // assign the collection used for event storage
    this.collection = eventCollection;
    this.operationStorage = operationStorage;
    this.ledgerNodeId = ledgerNodeId;
    this.plugins = {};
    // expose utils that can be used in storage plugins
    this.util = {
      assert,
      dbHash: database.hash,
      logger,
      BedrockError,
    };
  }

  /**
   * Adds an event to associate with a ledger given an event and a set of
   * options.
   *
   * event - the event to associate with a ledger.
   * meta - the metadata that is associated with the event.
   *   eventHash - the hash of the event data.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     event - the event that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  add({event, meta}, callback) {
    if(!(event && _.isObject(event))) {
      throw new TypeError('`event` must be an object.');
    }
    if(!(meta && meta.eventHash)) {
      throw new TypeError('`meta.eventHash` is required.');
    }
    const {operationHash} = event;
    // drop `operationHash` from the event without mutating or cloning
    const _event = _.pickBy(event, (v, k) => k !== 'operationHash');
    // insert the event
    const now = Date.now();
    const record = {
      event: _event,
      meta: _.defaults(meta, {
        created: now,
        updated: now
      })
    };

    logger.verbose(`adding event: ${meta.eventHash}`);
    async.auto({
      checkOps: callback => {
        if(!operationHash && jsonld.hasValue(
          event, 'type', 'WebLedgerOperationEvent')) {
          return callback(new BedrockError(
            '`operationHash` is required for event type ' +
            '`WebLedgerOperationEvent`', 'DataError', {event}));
        }
        // some types of events do not include operationHash
        if(!operationHash) {
          return callback();
        }
        const {eventHash} = meta;
        this.operationStorage.exists(
          {eventHash, operationHash}, (err, result) => {
            if(err) {
              return callback(err);
            }
            // failure
            if(!result) {
              return callback(new BedrockError(
                'Some operations have not been properly assigned to the event.',
                'InvalidStateError', {eventRecord: record, operationHash}));
            }
            // success
            callback();
          });
      },
      insert: ['checkOps', (results, callback) => this.collection.insert(
        record, database.writeOptions, (err, result) => {
          if(err && database.isDuplicateError(err)) {
            return callback(new BedrockError(
              'An event with the same hash already exists.',
              'DuplicateError', {
                httpStatusCode: 409,
                public: true,
                eventHash: meta.eventHash
              }, err.message));
          }
          if(err) {
            return callback(err);
          }
          callback(null, {
            event: result.ops[0].event,
            meta: result.ops[0].meta
          });
        })],
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(null, results.insert);
    });
  }

  // TODO: add docs
  addMany({events}, callback) {
    const dupHashes = [];
    // retries on duplicate errors
    async.retry({
      errorFilter: database.isDuplicateError,
      times: Infinity
    }, callback => this.collection.insertMany(
      events, {ordered: true}, err => {
        if(err) {
          if(database.isDuplicateError(err)) {
            // remove events up to the dup and retry
            dupHashes.push(events[err.index].meta.eventHash);
            events.splice(0, err.index + 1);
            if(events.length === 0) {
              // the last event was a duplicate, no more events to try, end
              return callback();
            }
            return callback(err);
          }
          return callback(err);
        }
        callback();
      }),
    err => {
      if(err) {
        return callback(err);
      }
      callback(null, {dupHashes});
    });
  }

  /**
   * Identify events that are not in storage.
   *
   * @param eventHash the hash or array of hashes to check.
   * @param callback(err, result) called onced the operation completes.
   */
  difference(eventHash, callback) {
    const hashes = [].concat(eventHash);
    const query = {
      'meta.deleted': {$exists: false},
      'meta.eventHash': {$in: hashes},
    };
    this.collection.find(query, {_id: 0, 'meta.eventHash': 1})
      .toArray((err, result) => {
        if(err) {
          return callback(err);
        }
        const localEvents = new Set(result.map(r => r.meta.eventHash));
        callback(null, hashes.filter(v => !localEvents.has(v)));
      });
  }

  // return records in the same order as the request
  // FIXME: `event.operation` must be removed from merge events
  getMany({eventHashes}) {
    const operationCollectionName = this.operationStorage.collection.s.name;
    return this.collection.aggregate([
      {$match: {
        'meta.eventHash': {$in: eventHashes},
      }},
      {$lookup:
        {
          from: operationCollectionName,
          let: {eventHash: '$meta.eventHash'},
          pipeline: [
            {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
            {$sort: {'meta.eventOrder': 1}},
            {$replaceRoot: {newRoot: "$operation"}}
          ],
          as: 'event.operation'
        }
      },
      // FIXME: This looks like it would be VERY slow
      {$addFields: {_order: {$indexOfArray: [eventHashes, '$meta.eventHash']}}},
      {$sort: {'_order': 1}},
      {$project: {_id: 0, _order: 0}},
    ], {allowDiskUse: true});
  }

  /**
   * Determine if an event with a given hash exists.
   *
   * @param eventHash the hash or array of hashes of the event(s).
   * @param callback(err, result) called once the operation completes.
   */
  exists(eventHash, callback) {
    const hashes = [].concat(eventHash);
    const query = {
      'meta.deleted': {$exists: false},
      'meta.eventHash': {$in: hashes},
    };
    this.collection.find(query).count((err, result) =>
      err ? callback(err) : callback(null, hashes.length === result));
  }

  /**
   * Gets an event in the ledger given a query and a set of options.
   *
   * eventHash - the hash of the event to fetch from storage.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval
   *     event - the event.
   *     meta - metadata about the event.
   */
  get(eventHash, callback) {
    const operationCollectionName = this.operationStorage.collection.s.name;
    const query = {
      'meta.eventHash': eventHash,
      'meta.deleted': {$exists: false}
    };
    this.collection.aggregate([
      {$match: query},
      {$limit: 1},
      {$lookup: {
        from: operationCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
          {$sort: {'meta.eventOrder': 1}},
          {$replaceRoot: {newRoot: "$operation"}}
        ],
        as: 'event.operation'
      }},
    ], {allowDiskUse: true}).toArray((err, result) => {
      if(err) {
        return callback(err);
      }
      if(result.length === 0) {
        return callback(new BedrockError(
          'Failed to get event. An event with the given ID does not exist.',
          'NotFoundError', {
            httpStatusCode: 404,
            public: true,
            eventHash
          }));
      }
      const {event, meta} = result[0];
      if(event.type !== 'WebLedgerOperationEvent') {
        delete event.operation;
      }
      callback(null, {event, meta});
    });
  }

  /**
   * Gets the active configuration based on blockHeight. A ledger configuration
   * is active for blocks that are *subsequent* to the block that includes
   * the ledger configuration event itself.
   *
   * blockHeight - the blockHeight used to locate the ledger configuration.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval.
   *     event - the event.
   *     meta - metadata about the event.
   */
  getActiveConfig({blockHeight}, callback) {
    assert.optionalNumber(blockHeight, 'blockHeight');
    const query = {
      'event.type': 'WebLedgerConfigurationEvent',
      // NOTE: the active config does not include any configs that may be in
      // the block specified by blockHeight
      'meta.blockHeight': {$lt: blockHeight},
      'meta.deleted': {$exists: false},
    };
    this.collection.find(query).sort({
      'meta.blockHeight': -1,
      'meta.blockOrder': -1
    }).limit(1).toArray((err, result) => {
      if(err) {
        return callback(err);
      }

      if(result.length === 0) {
        return callback(new BedrockError(
          'The active ledger configuration was not found.',
          'NotFoundError', {blockHeight, httpStatusCode: 404, public: true}));
      }

      callback(null, result[0]);
    });
  }

  /**
   * Gets a count of events.
   *
   * @param consensus - filter events based on consensus status.
   * @param type - filter events based on event type.
   *
   * @param callback(err, count) - the callback to call when finished.
   */
  // consensus === undefined means ignore consensus
  getCount({consensus, type}, callback) {
    if(!(callback && typeof callback === 'function')) {
      throw new TypeError('`callback` must be a function.');
    }
    const query = {
      'meta.deleted': {
        $exists: false
      }
    };
    if(typeof consensus === 'boolean') {
      query['meta.consensus'] = {$exists: consensus};
    }
    if(type) {
      query['event.type'] = type;
    }
    this.collection.find(query).count(callback);
  }

  /**
   * Gets the latest configuration event that has consensus.
   *
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval.
   *     event - the event.
   *     meta - metadata about the event.
   */
  getLatestConfig(callback) {
    // find the latest config event that has consensus
    const query = {
      'event.type': 'WebLedgerConfigurationEvent',
      'meta.deleted': {$exists: false},
    };
    this.collection.find(query).sort({
      'meta.blockHeight': -1,
      'meta.blockOrder': -1
    }).limit(1).toArray((err, result) => {
      if(err) {
        return callback(err);
      }

      if(result.length === 0) {
        return callback(new BedrockError(
          'The latest ledger configuration was not found.',
          'NotFoundError', {httpStatusCode: 404, public: true}));
      }

      callback(null, result[0]);
    });
  }

  /**
   * Update an existing event associated with the ledger given an
   * eventId, an array of patch instructions, and a set of options.
   *
   * eventHash - the ID of the event to update
   * patch - a list of patch commands for the event
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the value of the updated event.
   */
  update({eventHash, patch}, callback) {
    if(!Array.isArray(patch)) {
      throw new TypeError('patch must be an array');
    }
    async.auto({
      buildUpdate: callback => {
        const setObject = {};
        const unsetObject = {};
        const pushFields = {};
        const pullFields = {};

        async.eachSeries(patch, (operation, callback) => {
          // ensure that only meta fields are modified
          const opLength = Object.keys(operation.changes).length;
          if(opLength !== 1 ||
            (opLength === 1 && operation.changes.meta === undefined)) {
            return callback(new BedrockError(
              'Only event meta can be updated.',
              'Forbidden', {operation: operation}
            ));
          }

          // process set, unset, add, and remove operations
          if(operation.op === 'set') {
            _.extend(setObject, operation.changes);
          }
          else if(operation.op === 'unset') {
            _.extend(unsetObject, operation.changes);
          }
          else if(operation.op === 'add') {
            for(const key in operation.changes) {
              const arrayUpdate = database.buildUpdate(operation.changes);
              const field = Object.keys(arrayUpdate)[0];
              if(field in pushFields) {
                pushFields[field].$each.push(arrayUpdate[field]);
              } else {
                pushFields[field] = {$each: [arrayUpdate[field]]};
              }
            }
          } else if(operation.op === 'remove') {
            for(const key in operation.changes) {
              const arrayUpdate = database.buildUpdate(operation.changes);
              const field = Object.keys(arrayUpdate)[0];
              if(field in pullFields) {
                pullFields[field].push(arrayUpdate[field]);
              } else {
                pullFields[field] = [arrayUpdate[field]];
              }
            }
          }

          callback();
        }, err => {
          if(err) {
            return callback(err);
          }

          // build the update object for MongoDB
          const update = {};
          const setFields = database.buildUpdate(setObject);
          const unsetFields = database.buildUpdate(unsetObject);

          if(Object.keys(setFields).length > 0) {
            update.$set = setFields;
          }
          if(Object.keys(unsetFields).length > 0) {
            update.$unset = unsetFields;
          }
          if(Object.keys(pushFields).length > 0) {
            update.$addToSet = pushFields;
          }
          if(Object.keys(pullFields).length > 0) {
            update.$pullAll = pullFields;
          }

          callback(null, update);
        });
      },
      update: ['buildUpdate', (results, callback) => this.collection.update(
        {'meta.eventHash': eventHash},
        results.buildUpdate, database.writeOptions, callback)],
      checkUpdate: ['update', (results, callback) => {
        if(results.update.result.n === 0) {
          return callback(new BedrockError(
            'Could not update event. Event with given hash not found.',
            'NotFoundError', {eventHash}));
        }
        callback();
      }]
    }, err => callback(err));
  }

  /**
   * Delete an event associated with the ledger given an event hash and a
   * set of options.
   *
   * eventHash - the hash of the event to delete.
   * options - a set of options used when deleting the event.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  remove(eventHash, callback) {
    async.auto({
      update: callback => {
        // find and delete the existing event
        const filter = {
          'meta.eventHash': eventHash
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
        this.collection.updateOne(filter, update, callback);
      },
      ensureUpdate: ['update', (results, callback) => {
        if(results.update.matchedCount !== 1) {
          return callback(new BedrockError(
            'Delete of event failed.', 'NotFoundError', {eventHash}
          ));
        }
        callback();
      }]
    }, err => callback(err));
  }
};
