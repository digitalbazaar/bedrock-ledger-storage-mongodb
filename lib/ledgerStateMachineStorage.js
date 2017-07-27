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

    // event and block storage subsystems for `get` API
    this.eventStorage = options.eventStorage;
    this.blockStorage = options.blockStorage;
  }

  /**
   * Update a state machine object given the object, metadata associated with
   * the object, and a set of options.
   *
   * object - the object to update in the ledger. If the object doesn't exist,
   *   it will be created.
   * meta - the metadata associated with the object.
   *   blockHeight - the block height that resulted in the object.
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
    if(!meta.blockHeight) {
      return callback(new BedrockError(
        'A `blockHeight` for the given object was not specified.',
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
        this.collection.updateOne(
          criteria, update, upsertOptions, (err, result) => {
            if(err) {
              return callback(err);
            }
            callback(null, result);
          });
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(null, {object: object, meta: meta});
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
      updateStateMachine: callback => this._updateStateMachine(callback),
      find: ['updateStateMachine', (results, callback) => {
        // find an existing object with consensus
        const query = {
          id: database.hash(objectId),
          'meta.deleted': {
            $exists: false
          }
        };
        this.collection.findOne(query, callback);
      }]
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

  /**
   * Updates the state machine to the latest block.
   *
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  _updateStateMachine(callback) {
    async.auto({
      getLatestBlockHeight: callback => {
        this.blockStorage.getLatest(callback);
      },
      getStateMachineBlockHeight: callback => {
        // find the latest config block with consensus
        const query = {
          'meta.blockHeight': {
            $exists: true
          }
        };

        this.collection.find(query).sort(
          {'meta.blockHeight': -1}).limit(1).toArray(results => {
          if(results === null) {
            return callback(null, 0);
          }
          callback(null, results[0].block.blockHeight);
        });
      },
      replayEvents: ['getLatestBlockHeight', 'getStateMachineBlockHeight',
        (results, callback) => {
        const latestBlockHeight =
          results.getLatestBlockHeight.eventBlock.block.blockHeight;
        let smBlockHeight = results.getStateMachineBlockHeight;

        async.until(
          () => { return smBlockHeight > latestBlockHeight; }, callback => {
            this.blockStorage.getByHeight(smBlockHeight, (err, record) => {
              if(err) {
                return callback(err);
              }
              smBlockHeight++;
              this._updateStateMachineWithBlock(record.block, callback);
            });
        }, err => callback(err));
      }]
    }, (err, results) => callback(err));
  }

  /**
   * Updates the state machine with the given block data.
   *
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  _updateStateMachineWithBlock(block, callback) {
    //console.log("USMWB", block);
    async.eachSeries(block.event, (event, callback) => {
      if(event.operation === 'Create' && Array.isArray(event.input)) {
        async.eachSeries(event.input, (input, callback) => {

          // FIXME: If input is ni:/// hash, fetch it from event storage
          const meta = { blockHeight: block.blockHeight };
          const options = {};
          this.update(input, meta, options, callback);
        }, err => callback(err));
      } else {
        // skip update of state machine
        callback();
      }
    }, err => callback(err));
  }
};
