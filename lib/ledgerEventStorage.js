/*!
 * Ledger event storage class.
 *
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const BedrockError = bedrock.util.BedrockError;

// converts a buffer to a URL-safe base64 value
function b64url(input) {
  return input.toString('base64').replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// TODO: ideally, code to create indexes for event storage would be in
// this file

// get logger
const logger = bedrock.loggers.get('app');

/**
 * The events API is used to perform operations on events associated
 * with a particular ledger.
 */
module.exports = class LedgerEventStorage {
  constructor(options) {
    // assign the collection used for event storage
    this.collection = options.eventCollection;
  }

  /**
   * Adds an event to associate with a ledger given an event and a set of
   * options.
   *
   * event - the event to associate with a ledger.
   * meta - the metadata that is associated with the event.
   *   eventHash - the hash of the event data.
   * options - a set of options used when creating the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     event - the event that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  add(event, meta, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    if(!meta.eventHash) {
      return callback(new BedrockError(
        'An event hash for the given event was not specified.',
        'BadRequest', {meta: meta}));
    }

    async.auto({
      insert: callback => {
        // insert the event
        const now = Date.now();
        const record = {
          eventHash: meta.eventHash,
          event: event,
          meta: _.defaults(meta, {
            created: now,
            updated: now
          })
        };

        logger.debug('adding event', meta.eventHash);

        this.collection.insert(
          record, database.writeOptions, (err, result) => {
            if(err) {
              return callback(err);
            }
            callback(null, result.ops[0]);
          });
      }
    }, (err, results) => {
      if(err) {
        if(database.isDuplicateError(err)) {
          return callback(new BedrockError(
            'An event with the same hash already exists.',
            'DuplicateEvent', {
              httpStatusCode: 409,
              public: true,
              eventHash: meta.eventHash
            }));
        }
        return callback(err);
      }
      callback(null, {event: results.insert.event, meta: results.insert.meta});
    });
  }

  /**
   * Gets one or more events in the ledger given a query and a set of
   * options.
   *
   * eventHash - the hash of the event to fetch from storage.
   * options - a set of options used when retrieving the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval
   *     event - the event.
   *     meta - metadata about the event.
   */
  get(eventHash, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        // find an existing block with consensus
        const query = {
          eventHash: eventHash,
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
          'NotFound', {eventHash: eventHash}));
      }

      callback(null, {event: results.find.event, meta: results.find.meta});
    });
  }

  /**
   * Gets all event hashes that match the given query.
   *
   * TODO: add option to get an iterator instead of an array response
   *
   * options - a set of options used when retrieving the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   hashes - an array of event hashes that match the query.
   */
  getHashes(options, callback) {
    const collection = this.collection;

    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        const query = {
          'meta.deleted': {
            $exists: false
          }
        };
        /* Note: There is an undocumented assumption that hashes will always
        be URLs that uniquely identify how they were calculated via scheme
        information. If this information is not present, then two different
        consensus methods could produce the same hash value using different
        mechanisms causing trouble. */
        // TODO: support an option to filter particular schemes for hashes?
        if(typeof options.consensus === 'boolean') {
          query['meta.consensus'] = {$exists: options.consensus};
        }
        const queryOpts = {
          sort: {eventHash: 1}
        };
        if(typeof options.limit === 'number') {
          queryOpts.limit = options.limit;
        }
        collection.find(query, {eventHash: 1}, queryOpts).toArray(callback);
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(null, results.find.map(r => r.eventHash));
    });
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
  getLatestConfig(options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        // find the latest config event that has consensus
        const query = {
          'event.type': 'WebLedgerConfigurationEvent',
          'meta.deleted': {$exists: false},
          'meta.consensusDate': {$exists: true}
        };
        // FIXME: sort should be done by block height, not by date
        this.collection.find(query).sort({
          'meta.consensusDate': -1
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
   * options - a set of options used when updating the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the value of the updated event.
   */
  update(eventHash, patch, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    if(!Array.isArray(patch)) {
      throw new TypeError('patch must be an array');
    }

    async.auto({
      buildUpdate: callback => {
        const setObject = {};
        const unsetObject = {};
        const setFields = {};
        const unsetFields = {};
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
      update: ['buildUpdate', (results, callback) => {
        this.collection.update(
          {eventHash: eventHash}, results.buildUpdate,
          database.writeOptions, callback);
      }],
      checkUpdate: ['update', (results, callback) => {
        if(results.update.result.n === 0) {
          return callback(new BedrockError(
            'Could not update event. Event with given hash not found.',
            'NotFound', {eventHash: eventHash}));
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
  remove(eventHash, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      update: callback => {
        // find and delete the existing event
        const filter = {
          eventHash: eventHash
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
            'Delete of event failed.', 'NotFound', {eventHash: eventHash}
          ));
        }
        callback();
      }]
    }, err => callback(err));
  }
};
