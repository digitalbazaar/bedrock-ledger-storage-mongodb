/*!
 * Ledger event storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const logger = require('./logger');
const BedrockError = bedrock.util.BedrockError;

// TODO: ideally, code to create indexes for event storage would be in
// this file

/**
 * The events API is used to perform operations on events associated
 * with a particular ledger.
 */
module.exports = class LedgerEventStorage {
  constructor({eventCollection}) {
    // assign the collection used for event storage
    this.collection = eventCollection;
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

    // insert the event
    const now = Date.now();
    const record = {
      eventHash: database.hash(meta.eventHash),
      event: event,
      meta: _.defaults(meta, {
        created: now,
        updated: now
      })
    };

    logger.verbose(`adding event: ${meta.eventHash}`);

    this.collection.insert(
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
        callback(null, {event: result.ops[0].event, meta: result.ops[0].meta});
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
      eventHash: {$in: hashes},
    };
    this.collection.find(query, {_id: 0, eventHash: 1})
      .toArray((err, result) => {
        if(err) {
          return callback(err);
        }
        const localEvents = new Set(result.map(({eventHash}) => eventHash));
        callback(null, hashes.filter(v => !localEvents.has(v)));
      });
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
      eventHash: {$in: hashes},
    };
    this.collection.find(query).count((err, result) =>
      err ? callback(err) : callback(null, hashes.length === result));
  }

  /**
   * Gets one or more events in the ledger given a query and a set of
   * options.
   *
   * eventHash - the hash of the event to fetch from storage.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval
   *     event - the event.
   *     meta - metadata about the event.
   */
  get(eventHash, callback) {
    async.auto({
      find: callback => {
        // find an existing block with consensus
        const query = {
          eventHash,
          'meta.deleted': {
            $exists: false
          }
        };
        this.collection.findOne(query, callback);
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }

      if(!results.find) {
        return callback(new BedrockError(
          'Failed to get event. An event with the given ID does not exist.',
          'NotFoundError', {
            httpStatusCode: 404,
            public: true,
            eventHash
          }));
      }

      callback(null, {event: results.find.event, meta: results.find.meta});
    });
  }

  /**
   * Gets a count of events.
   *
   * @param options - the options to use.
   *   consensus - filter events based on consensus status.
   * @param callback(err, count) - the callback to call when finished.
   */
  // consensus === undefined means ignore consensus
  getCount({consensus}, callback) {
    if(!callback && typeof(callback) === 'function') {
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
    this.collection.find(query).count(callback);
  }

  /**
   * Gets the latest configuration event that has consensus.
   *
   * options - a set of options used when retrieving the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval
   *     event - the event.
   *     meta - metadata about the event.
   */
  getLatestConfig(callback) {
    async.auto({
      find: callback => {
        // find the latest config event that has consensus
        const query = {
          'event.type': 'WebLedgerConfigurationEvent',
          'meta.deleted': {$exists: false},
        };
        // TODO: secondary sort by eventOrder?
        this.collection.find(query).sort({
          'meta.blockHeight': -1
        }).limit(1).toArray(callback);
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }

      let record = {};
      if(results.find.length === 1) {
        record = results.find[0];
      }
      callback(null, record);
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
        {eventHash}, results.buildUpdate, database.writeOptions, callback)],
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
          eventHash: database.hash(eventHash)
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
