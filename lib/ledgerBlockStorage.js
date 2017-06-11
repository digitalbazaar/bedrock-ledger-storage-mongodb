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
  constructor(collection) {
    // assign the collection used for block storage
    this.collection = collection;
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
      insert: callback  => {
        // insert the block
        const now = Date.now();
        const record = {
          id: database.hash(block.id),
          block: block,
          meta: _.defaults(meta, {
            created: now,
            updated: now
          })
        };

        logger.debug('adding block', block.id);

        // FIXME: Determine if events should be stored in blocks, or separately.

        this.collection.insert(
          record, database.writeOptions, function(err, result) {
            if(err) {
              return callback(err);
            }
            callback(null, result.ops[0]);
        });
      },
    }, function(err, results) {
      callback(err, {block: results.insert.block, meta: results.insert.meta});
    });
  }

  /**
   * Gets a block and its associated metadata from a the ledger given
   * a blockId.
   *
   * blockId - the identifier of the block to fetch from the ledger.
   * options - a set of options used when retrieving the block.
   * callback(err, records) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval.
   *   block - the block.
   *   meta - metadata about the block.
   */
  get(blockId, options, callback) {

  }

  /**
   * Retrieves the latest events block and the latest configuration block
   * from the ledger.
   *
   * options - a set of options used when retrieving the latest blocks.
   * callback(err, result) - the callback to call when finished.
   * err - An Error if an error occurred, null otherwise.
   * result - the latest events and configuration blocks.
   * configurationBlock - the latest configuration block.
   * eventsBlock - the latest events block.
   */
  getLatest(options, callback) {

  }

  /**
   * Update an existing block in the ledger given a blockId, an array of
   * patch instructions, and a set of options.
   *
   * blockId - the URI of the block to update.
   * patch - the patch instructions to execute on the block.
   * options - a set of options used when updating the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  update(blockId, patch, options, callback) {

  }

  /**
   * Delete a block in the ledger given a blockID and a set of options.
   *
   * actor - the actor performing the action.
   * blockId - the block to delete in the ledger.
   * options - a set of options used when deleting the block.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  delete(blockId, options, callback) {

  }
}

api.LedgerBlockStorage = LedgerBlockStorage;
