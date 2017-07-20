/*!
 * Ledger block storage class.
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
 * The blocks API is used to perform operations on blocks associated with a
 * particular ledger.
 */
module.exports = class LedgerBlockStorage {
  constructor(options) {
    // assign the collection used for block storage
    this.collection = options.blockCollection;
  }

  /**
   * Adds a block in the ledger given a block, metadata associated with the
   * block, and a set of options.
   *
   * block - the block to create in the ledger.
   * meta - the metadata associated with the block.
   *   blockHash - the hash value of the block.
   * options - a set of options used when creating the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     block - the block that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  add(block, meta, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }
    if(!meta.blockHash) {
      return callback(new BedrockError(
        'A block hash for the given block was not specified.',
        'BadRequest', {meta: meta}));
    }

    async.auto({
      insert: callback => {
        // insert the block
        const now = Date.now();
        const record = {
          id: database.hash(block.id),
          blockHash: database.hash(meta.blockHash),
          block: block,
          meta: _.defaults(meta, {
            created: now,
            updated: now
          })
        };

        logger.debug('adding block', meta.blockHash);

        // FIXME: We should deconstruct the events from the blocks

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
            'A block with the same hash already exists.',
            'DuplicateBlock', {blockHash: meta.blockHash}));
        }
        return callback(err);
      }
      callback(null, {block: results.insert.block, meta: results.insert.meta});
    });
  }

  /**
   * Gets the block that has consensus given a blockId.
   *
   * blockId - the identifier of the block that has consensus.
   * options - a set of options used when retrieving the block(s).
   * callback(err, block) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   block - the block with the given ID that has consensus.
   */
  get(blockId, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        // find an existing block with consensus
        const query = {
          id: database.hash(blockId),
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
          'Failed to get block. A block with the given ID does not exist.',
          'NotFound', {blockId: blockId}));
      }

      callback(null, {block: results.find.block, meta: results.find.meta});
    });
  }

  /**
   * Gets all blocks matching a given blockId even if they have not
   * achieved consensus.
   *
   * blockId - the identifier of the block(s) to fetch from the ledger.
   * options - a set of options used when retrieving the block(s).
   * callback(err, iterator) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   iterator - an iterator for all of the returned blocks.
   */
  getAll(blockId, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      find: callback => {
        // find an existing block
        const query = {
          id: database.hash(blockId),
          'meta.deleted': {
            $exists: false
          }
        };
        const cursor = this.collection.find(query);
        callback(null, cursor);
      },
      hasNext: ['find', (results, callback) => {
        // check to see if there are any results
        results.find.hasNext().then(hasNext => {
          callback(null, hasNext);
        });
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }

      // create a block iterator
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
            return {
              block: record.block,
              meta: record.meta
            };
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
  }

  /**
   * Retrieves the genesis block from the ledger.
   *
   * options - a set of options used when retrieving the genesis block.
   * callback(err, result) - the callback to call when finished.
   * err - An Error if an error occurred, null otherwise.
   * result - the result with the genesis block.
   *   genesisBlock - the genesis block.
   */
  getGenesis(options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    // find the genesis block with consensus
    const query = {
      'block.previousBlock': {$exists: false},
      'block.previousBlockHash': {$exists: false},
      'meta.deleted': {$exists: false},
      'meta.consensus': {$exists: true}
    };
    this.collection.findOne(query, {block: 1}, (err, record) => {
      if(err) {
        return callback(err);
      }
      callback(null, {
        genesisBlock: record.block
      });
    });
  }

  /**
   * Retrieves the latest events block from the ledger.
   *
   * options - a set of options used when retrieving the latest blocks.
   * callback(err, result) - the callback to call when finished.
   * err - An Error if an error occurred, null otherwise.
   * result - the latest events and configuration blocks.
   *   eventBlock - the latest events block.
   */
  getLatest(options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      getLatestEventBlock: callback => {
        // find the latest config block with consensus
        const query = {
          'block.type': 'WebLedgerEventBlock',
          'meta.deleted': {
            $exists: false
          },
          'meta.consensus': {
            $exists: true
          }
        };
        // FIXME: this is not the latest block, this is the last block that
        // was updated ... this needs to be fixed to return the block that
        // no other block has as its `previousBlockHash`; with this code, if
        // a block's meta is updated, it could be returned as the
        // "latest block" despite not actually being the tail block in the
        // chain
        this.collection.find(query).sort(
          {'meta.updated': -1}).limit(1).toArray(callback);
      }
    }, (err, results) => {
      if(err) {
        return callback(err);
      }

      let eventBlock = {};
      if(results.getLatestEventBlock.length === 1) {
        eventBlock = results.getLatestEventBlock[0];
      }
      callback(null, {eventBlock: eventBlock});
    });
  }

  /**
   * Update an existing block in the ledger given a block hash, an array of
   * patch instructions, and a set of options.
   *
   * blockHash - the hash of the block to update.
   * patch - the patch instructions to execute on the block.
   * options - a set of options used when updating the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  update(blockHash, patch, options, callback) {
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
              'Only block meta can be updated.',
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
          {'meta.blockHash': blockHash}, results.buildUpdate,
          database.writeOptions, callback);
      }],
      checkUpdate: ['update', (results, callback) => {
        if(results.update.result.n === 0) {
          return callback(new BedrockError(
            'Could not update block. Block with given hash not found.',
            'NotFound', {blockHash: blockHash}));
        }
        callback();
      }]
    }, err => callback(err));
  }

  /**
   * Delete a block in the ledger given a block hash and a set of options.
   *
   * actor - the actor performing the action.
   * blockHash - the hash of the block to delete.
   * options - a set of options used when deleting the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  remove(blockHash, options, callback) {
    if(typeof options === 'function') {
      callback = options;
      options = {};
    }

    async.auto({
      update: callback => {
        // find and delete the existing block
        const filter = {
          blockHash: database.hash(blockHash)
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
            'Delete of block failed.', 'NotFound', {blockHash: blockHash}
          ));
        }
        callback();
      }]
    }, callback);
  }
};
