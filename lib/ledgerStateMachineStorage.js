/*!
 * Ledger state machine storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const jsonpatch = require('fast-json-patch');
const logger = require('./logger');
const BedrockError = bedrock.util.BedrockError;

// TODO: add an API for performing a "dry-run" of processing a block to
// modify state to ensure all operations are valid (needed for some
// consensus algorithms)

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
   * Create a state machine object given the object, metadata associated with
   * the object.
   *
   * object - the object to create in the ledger. If the object already exists,
   *   a duplicate error will be raised.
   * meta - the metadata associated with the object.
   *   blockHeight - the block height that resulted in the object.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     object - the object that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  create({object, meta}, callback) {
    // FIXME: change to TypeError for consistency with other APIs?
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
      insert: callback => {
        // insert the object
        const now = Date.now();
        const record = {
          id: database.hash(object.id),
          object,
          meta: _.defaults(meta, {
            created: now,
            updated: now,
            sequence: 0
          })
        };

        logger.debug('adding state machine object: ' + object.id);

        this.collection.insert(record, database.writeOptions, (err, result) => {
          if(err) {
            return callback(err);
          }
          callback(null, {
            object: result.ops[0].object,
            meta: result.ops[0].meta
          });
        });
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(null, results.insert);
    });
  }

  /**
   * Patch a state machine object given the target object ID, JSON patch,
   * metadata associated with the object (this will be overwritten), and a
   * set of options.
   *
   * target - the ID of the target object to patch in the ledger.
   * patch - the JSON patch to apply.
   * sequence - the sequence to match against the current record.
   * meta - the metadata associated with the object.
   *   blockHeight - the block height that resulted in the object.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     object - the object that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  patch({target, patch, sequence, meta}, callback) {
    // TODO: support `frame` option

    // FIXME: change to TypeError for consistency with other APIs?
    if(!meta.blockHeight) {
      return callback(new BedrockError(
        'A `blockHeight` for the given object was not specified.',
        'BadRequest', {meta: meta}));
    }

    async.auto({
      record: callback => this.get(target, {update: false}, callback),
      patch: ['record', (results, callback) => {
        const {object} = results.record;
        const errors = jsonpatch.validate(patch, object);
        if(errors) {
          return callback(new BedrockError(
            'Invalid JSON patch.',
            'ValidationError', {
              target,
              patch,
              public: true,
              httpStatusCode: 400
            }));
        }
        const patched = jsonpatch.applyPatch(object, patch).newDocument;
        // FIXME: make more robust
        bedrock.jsonld.compact(
          patched, object['@context'],
          (err, compacted) => callback(err, compacted));
      }],
      update: ['patch', (results, callback) => {
        const object = results.patch;
        const now = Date.now();
        const update = {
          $set: {
            object,
            meta: _.defaults(meta, {
              updated: now,
              sequence: sequence + 1
            })
          }
        };

        logger.debug('patching state machine object: ' + object.id);

        const query = {
          id: database.hash(target),
          'meta.sequence': sequence
        };
        this.collection.update(query, update, database.writeOptions, callback);
      }],
      checkUpdate: ['update', (results, callback) => {
        if(results.update.result.n === 0) {
          return callback(new BedrockError(
            'Could not update object. Object with sequence number not found.',
            'NotFoundError', {target, sequence}));
        }
        callback();
      }]
    }, err => callback(err));
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
  // FIXME: update to use {} style named-arguments
  get(objectId, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }
    if(!objectId || typeof objectId !== 'string') {
      throw new TypeError('objectId must be a string.');
    }

    async.auto({
      updateStateMachine: callback => {
        if(options.update !== false) {
          return this._updateStateMachine(callback);
        }
        callback();
      },
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
          'An object with the given ID does not exist.',
          'NotFoundError', {objectId, public: true, httpStatusCode: 404}));
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
      getLatestBlockHeight: callback =>
        this.blockStorage.getLatestSummary(callback),
      getStateMachineBlockHeight: callback => {
        // find the latest config block with consensus
        const query = {
          'meta.blockHeight': {
            $exists: true
          }
        };
        this.collection.find(query, {_id: 0, 'meta.blockHeight': 1}).sort(
          {'meta.blockHeight': -1}).limit(1).toArray((err, records) => {
          if(records.length === 0) {
            return callback(null, 0);
          }
          callback(null, records[0].meta.blockHeight);
        });
      },
      replayBlocks: [
        'getLatestBlockHeight', 'getStateMachineBlockHeight',
        (results, callback) => {
          const latestBlockHeight =
            results.getLatestBlockHeight.eventBlock.block.blockHeight;
          let smBlockHeight = results.getStateMachineBlockHeight;
          async.until(
            () => (smBlockHeight > latestBlockHeight), callback => {
              this.blockStorage.getByHeight(smBlockHeight, (err, record) => {
                if(err) {
                  return callback(err);
                }
                smBlockHeight++;
                this._updateStateMachineWithBlock(record.block, callback);
              });
            }, err => callback(err));
        }]
    }, err => callback(err));
  }

  /**
   * Updates the state machine with the given block data.
   *
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  _updateStateMachineWithBlock(block, callback) {
    async.eachSeries(block.event, (event, callback) => {
      async.auto({
        getEvent: callback => {
          // If input is a ni:/// hash, fetch it from event storage
          if(typeof event === 'string' && event.startsWith('ni:///')) {
            return this.eventStorage.get(event, (err, result) => {
              if(err) {
                return callback(err);
              }
              callback(null, result.event);
            });
          }
          callback(null, event);
        },
        updateStateMachine: ['getEvent', (results, callback) => {
          // update the state machine by processing all inputs
          const event = results.getEvent;
          const meta = {blockHeight: block.blockHeight};
          const options = {};
          // FIXME: allow state machine plugins to handle applying operations
          if(event.type === 'WebLedgerOperationEvent' &&
            Array.isArray(event.operation)) {
            async.eachSeries(event.operation, (operation, callback) => {
              if(operation.type === 'CreateWebLedgerRecord') {
                return this.create({
                  object: operation.record,
                  meta
                }, _logStateMachineError(operation, callback));
              }
              if(operation.type === 'UpdateWebLedgerRecord') {
                return this.patch({
                  target: operation.recordPatch.target,
                  patch: operation.recordPatch.patch,
                  sequence: operation.recordPatch.sequence,
                  meta
                }, _logStateMachineError(operation, callback));
              }
              // skip unknown operation type
              logger.warning(
                'skipping unknown operation type: ' + operation.type);
              callback();
            }, err => callback(err));
          } else {
            // skip update of state machine
            callback();
          }
        }]
      }, err => callback(err));
    }, err => callback(err));
  }
};

function _logStateMachineError(operation, callback) {
  return err => {
    if(err) {
      logger.verbose(
        'state machine error when trying to apply operation',
        {operation, error: err});
    }
    callback();
  };
}
