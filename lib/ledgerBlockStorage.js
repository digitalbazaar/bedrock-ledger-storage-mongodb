/*!
 * Ledger block storage class.
 *
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const config = require('bedrock').config;
const database = require('bedrock-mongodb');
const BedrockError = bedrock.util.BedrockError;

// module API
const api = {};
module.exports = api;

// get logger
const logger = bedrock.loggers.get('app');

/**
 * The blocks API is used to perform operations on blocks associated with a
 * particular ledger.
 */
class LedgerBlockStorage {
  constructor(options) {
    // assign the collection used for block storage
    this.collection = options.blockCollection;
    // assign the function used for hashing blocks
    this.hashBlock = options.blockHasher;
  }

  /**
   * Creates a block in the ledger given a block, metadata associated with the
   * block, and a set of options.
   *
   * block - the block to create in the ledger.
   * meta - the metadata associated with the block.
   * options - a set of options used when creating the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *   block - the block that was committed to storage.
   *   meta - the metadata that was committed to storage.
   */
  create(block, meta, options, callback) {
    async.auto({
      hash: callback => {
        // hash the block
        this.hashBlock(block, callback);
      },
      insert: ['hash', (results, callback) => {
        // insert the block
        const now = Date.now();
        const record = {
          id: database.hash(block.id),
          blockHash: results.hash,
          block: block,
          meta: _.defaults(meta, {
            created: now,
            updated: now
          })
        };

        logger.debug('adding block', block.id);

        // FIXME: We should deconstruct the events from the blocks

        this.collection.insert(
          record, database.writeOptions, (err, result) => {
            if(err) {
              return callback(err);
            }
            callback(null, result.ops[0]);
          });
      }]
    }, (err, results) => {
      if(err) {
        if(database.isDuplicateError(err)) {
          return callback(new BedrockError(
            'A block with the same hash already exists.',
            'DuplicateBlock', {blockHash: results.hash}));
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
   * Retrieves the latest events block and the latest configuration block
   * from the ledger.
   *
   * options - a set of options used when retrieving the latest blocks.
   * callback(err, result) - the callback to call when finished.
   * err - An Error if an error occurred, null otherwise.
   * result - the latest events and configuration blocks.
   *   configurationBlock - the latest configuration block.
   *   eventsBlock - the latest events block.
   */
  getLatest(options, callback) {

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
  delete(blockHash, options, callback) {
    async.auto({
      update: callback => {
        // find and delete the existing block
        const filter = {
          blockHash: blockHash
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
}

api.LedgerBlockStorage = LedgerBlockStorage;
