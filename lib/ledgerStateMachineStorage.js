/*!
 * Ledger state machine storage class.
 *
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const BedrockError = bedrock.util.BedrockError;

// get logger
const logger = bedrock.loggers.get('app');

/**
 * The state machine API is used to perform operations on the
 * state machine associated with a particular ledger.
 */
module.exports = class LedgerStateMachineStorage {
  constructor(options) {
    // assign the collection used for state machine storage
    this.collection = options.stateMachineCollection;
  }

  /**
   * Update a state machine object given the object, metadata associated with
   * the object, and a set of options.
   *
   * object - the object to update in the ledger. If the object doesn't exist,
   *   it will be created.
   * meta - the metadata associated with the object.
   *   eventHash - the hash value of the block the object appears in.
   *   blockHash - the hash value of the event the object appears in.
   * options - a set of options used when creating the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     object - the block that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  update(object, meta, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }
    if(!object.id) {
      return callback(new BedrockError(
        'An `id` for the given object was not specified.',
        'BadRequest', {object: object}));
    }
    if(!meta.eventHash) {
      return callback(new BedrockError(
        'An `eventHash` for the given object was not specified.',
        'BadRequest', {meta: meta}));
    }
    if(!meta.blockHash) {
      return callback(new BedrockError(
        'A `blockHash` for the given object was not specified.',
        'BadRequest', {meta: meta}));
    }

    async.auto({
      upsert: callback => {
        // insert the object
        const now = Date.now();
        const update = {
          id: database.hash(object.id),
          object: object,
          meta: _.defaults(meta, {
            created: now,
            updated: now
          })
        };

        logger.debug('adding state machine object', object.id);

        // FIXME: We should deconstruct the events from the blocks
        const criteria = {id: database.hash(object.id)};
        const upsertOptions = _.defaults(database.writeOptions, {
          upsert: true
        });
        this.collection.update(
          criteria, update, upsertOptions, (err, result) => {
            if(err) {
              return callback(err);
            }
            callback(null, result.ops[0]);
          });
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(
        null, {object: results.upsert.object, meta: results.upsert.meta});
    });
  }

  /**
   * Gets the latest state machine object that has consensus from storage.
   *
   * objectId - the identifier of the object.
   * options - a set of options used when retrieving the object.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the object associated with the given objectId
   */
  get(objectId, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        // find an existing object with consensus
        const query = {
          id: database.hash(objectId),
          'meta.deleted': {
            $exists: false
          },
          'meta.consensus': {
            $exists: true
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
          'Failed to get object. An object with the given ID does not exist.',
          'NotFound', {objectId: objectId}));
      }

      callback(null, {object: results.find.object, meta: results.find.meta});
    });
  }
};
