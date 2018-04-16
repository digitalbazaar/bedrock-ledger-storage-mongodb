/*!
 * Ledger block storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const logger = require('./logger');
const {BedrockError} = bedrock.util;

/**
 * The blocks API is used to perform operations on blocks associated with a
 * particular ledger.
 */
module.exports = class LedgerBlockStorage {
  constructor({blockCollection, eventCollection, eventStorage}) {
    // assign the collection used for block storage
    this.collection = blockCollection;
    // assign the collection used for events storage
    this.eventCollection = eventCollection;
    // event storage API
    this.eventStorage = eventStorage;
  }

  /**
   * Adds a block in the ledger given a block, metadata associated with the
   * block.
   *
   * @param block - the block to create in the ledger.
   *   blockHeight - the height of the block
   *   event - an array of events associated with the block
   * @param meta - the metadata associated with the block.
   *   blockHash - the hash value of the block.
   * @param callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *     block - the block that was committed to storage.
   *     meta - the metadata that was committed to storage.
   */
  add({block, meta}, callback) {
    // check block
    if(!(block && Number.isInteger(block.blockHeight) && block.event)) {
      throw new TypeError(
        '`block.blockHeight` and `block.event` are required.');
    }
    if(!(meta && meta.blockHash)) {
      throw new TypeError('`meta.blockHash` is required.');
    }
    const {blockHeight, event} = block;
    // drop `event` from the block without mutating or cloning
    const _block = _.pickBy(block, (v, k) => k !== 'event');
    async.auto({
      checkEvent: callback => {
        const dHashes = event.map(eventHash => database.hash(eventHash));
        // NOTE: `meta.consensus` and `meta.consensusDate` are to be managed
        // by consensus algorithms and therefore are not validated here
        const query = {
          eventHash: {$in: dHashes},
          'meta.blockHeight': blockHeight,
          'meta.blockOrder': {$exists: true}
        };
        this.eventCollection.count(query, (err, result) => {
          if(err) {
            return callback(err);
          }
          // failure
          if(result !== event.length) {
            return callback(new BedrockError(
              'Some events have not been properly assigned to the block.',
              'InvalidStateError', {block: _block, event}));
          }
          // success
          callback();
        });
      },
      insert: ['checkEvent', (results, callback) => {
        // insert the block
        const now = Date.now();
        const record = {
          block: _block,
          blockHash: database.hash(meta.blockHash),
          id: database.hash(_block.id),
          meta: _.defaults(meta, {
            created: now,
            updated: now
          }),
        };

        logger.debug(`adding block: ${meta.blockHash}`);
        this.collection.insert(record, database.writeOptions, (err, result) => {
          if(err) {
            return callback(err);
          }
          callback(null, result.ops[0]);
        });
      }],
    }, (err, results) => {
      if(err) {
        if(database.isDuplicateError(err)) {
          return callback(new BedrockError(
            'A block with the same hash already exists.',
            'DuplicateError', {blockHash: meta.blockHash}, err));
        }
        return callback(err);
      }
      callback(null, {block: results.insert.block, meta: results.insert.meta});
    });
  }

  /**
   * Gets the block that has consensus given a blockId.
   *
   * @param blockId - the identifier of the block that has consensus.
   * @param [consensus] `false` to retrieve a non-consensus block instead.
   * @param callback(err, block) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   block - the block with the given ID that has consensus.
   */
  get({blockId, consensus = true}, callback) {
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
        if(!consensus) {
          query['meta.consensus'].$exists = false;
        }
        this.collection.findOne(query, callback);
      },
      expandEvents: ['find', (results, callback) => {
        if(!results.find) {
          return callback(new BedrockError(
            'A block with the given ID does not exist.',
            'NotFoundError', {blockId}));
        }
        // _expandEvents mutates the parameter
        this._expandEvents(results.find.block, callback);
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      // _expandEvents mutates the parameter
      callback(null, {block: results.find.block, meta: results.find.meta});
    });
  }

  // FIXME: this API is not used anywhere if if it should be kept, it needs
  // to be updated to get eventhashes etc.

  /**
   * Gets the block summary for consensus block given a blockId.
   *
   * @param blockId - the identifier of the block that has consensus.
   * @param [consensus] `false` to retrieve a summary for a non-consensus
   *   block instead.
   * @param [eventHash] `true` to get all event hashes from `event`.
   * @param callback(err, block) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   block - the block summary for the given ID that has consensus.
   */
  getSummary({blockId, consensus = true, eventHash}, callback) {
    async.auto({
      find: callback => {
        const query = {
          id: database.hash(blockId),
          'meta.deleted': {
            $exists: false
          },
          'meta.consensus': {
            $exists: true
          }
        };
        if(consensus === false) {
          query['meta.consensus'].$exists = false;
        }
        const projection = {};
        this.collection.findOne(query, projection, (err, record) => {
          if(err) {
            return callback(err);
          }
          if(!record) {
            return callback(new BedrockError(
              'A block with the given ID does not exist.',
              'NotFoundError', {blockId}));
          }
          return callback(null, record);
        });
      },
      eventHashes: ['find', (results, callback) => {
        if(!eventHash) {
          return callback();
        }
        // TODO: make code DRY
        // FIXME: this might be accomplished with aggregate query
        // get event hashes
        const block = results.find.block;
        const query = {'meta.blockHeight': block.blockHeight};
        const projection = {_id: 0, 'meta.eventHash': 1};
        this.eventCollection.find(query, projection)
          .sort({'meta.blockOrder': 1})
          .toArray((err, eventHashes) => {
            if(err) {
              return callback(err);
            }
            block.eventHash = eventHashes.map(r => r.meta.eventHash);
            callback();
          });
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(
        null, {block: results.find.block, meta: results.find.meta});
    });
  }

  /**
   * Gets a block that has consensus given a blockHeight.
   *
   * @param blockHeight - the height of the block that has consensus.
   * @param callback(err, block) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   block - the block with the given block height that has consensus.
   */
  getByHeight(blockHeight, callback) {
    async.auto({
      find: callback => {
        // find an existing block with consensus
        const query = {
          'block.blockHeight': blockHeight,
          'meta.deleted': {
            $exists: false
          },
          'meta.consensus': {
            $exists: true
          }
        };
        this.collection.findOne(query, callback);
      },
      expandEvents: ['find', (results, callback) => {
        if(!results.find) {
          return callback(new BedrockError(
            'A block with the given `blockHeight` does not exist.',
            'NotFoundError', {blockHeight}));
        }
        this._expandEvents(results.find.block, callback);
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(null, {block: results.find.block, meta: results.find.meta});
    });
  }

  /**
   * Gets the block summary for consensus block given a blockHeight.
   *
   * @param blockHeight - the height of the block that has consensus.
   * @param [consensus] `false` to retrieve a summary for a non-consensus
   * @param [eventHash] `true` to get all event hashes from `event`.
   * @param callback(err, block) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   block - the block summary for the given ID that has consensus.
   */
  getSummaryByHeight(
    {blockHeight, consensus = true, eventHash = false}, callback) {
    async.auto({
      find: callback => {
        const query = {
          'block.blockHeight': blockHeight,
          'meta.deleted': {
            $exists: false
          },
          'meta.consensus': {
            $exists: true
          }
        };
        if(consensus === false) {
          query['meta.consensus'].$exists = false;
        }
        const projection = {};
        this.collection.findOne(query, projection, (err, record) => {
          if(err) {
            return callback(err);
          }
          if(!record) {
            return callback(new BedrockError(
              'A block with the given block height does not exist.',
              'NotFoundError', {blockHeight}));
          }
          return callback(null, record);
        });
      },
      eventHashes: ['find', (results, callback) => {
        if(!eventHash) {
          return callback();
        }
        // TODO: make code DRY
        // FIXME: this might be accomplished with aggregate query
        // get event hashes
        const block = results.find.block;
        const query = {'meta.blockHeight': block.blockHeight};
        const projection = {_id: 0, 'meta.eventHash': 1};
        this.eventCollection.find(query, projection)
          .sort({'meta.blockOrder': 1})
          .toArray((err, eventHashes) => {
            if(err) {
              return callback(err);
            }
            block.eventHash = eventHashes.map(r => r.meta.eventHash);
            callback();
          });
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      callback(
        null, {block: results.find.block, meta: results.find.meta});
    });
  }

  /**
   * Gets all blocks matching a given blockId even if they have not
   * achieved consensus.
   *
   * @param blockId - the identifier of the block(s) to fetch from the ledger.
   * @param callback(err, iterator) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   iterator - an iterator for all of the returned blocks.
   */
  getAll(blockId, callback) {
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
            // TODO: expand events in block
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
   * @param callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result with the genesis block.
   *     genesisBlock - the genesis block and its meta.
   */
  getGenesis(callback) {
    // find the genesis block with consensus
    const query = {
      'block.previousBlock': {$exists: false},
      'block.previousBlockHash': {$exists: false},
      'meta.deleted': {$exists: false},
      'meta.consensus': {$exists: true}
    };
    this.collection.findOne(query, {block: 1, meta: 1}, (err, record) => {
      if(err) {
        return callback(err);
      }
      if(!record) {
        return callback(new BedrockError(
          'The genesis block does not exist.',
          'NotFoundError'));
      }
      this._expandEvents(record.block, err => {
        if(err) {
          return callback(err);
        }
        // NOTE: _expandEvents mutates record.block
        callback(null, {
          genesisBlock: {
            block: record.block,
            meta: record.meta
          }
        });
      });
    });
  }

  /**
   * Retrieves the latest block from the ledger.
   *
   * @param callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the block.
   *     eventBlock - the latest events block and meta.
   */
  getLatest(callback) {
    async.auto({
      block: callback => {
        // find the latest config block with consensus
        const query = {
          'block.type': 'WebLedgerEventBlock',
          'meta.deleted': {$exists: false},
          'meta.consensus': {$exists: true}
        };
        const sort = {'block.blockHeight': -1};
        this.collection.find(query).sort(sort).limit(1).toArray(callback);
      },
      expandEvents: ['block', (results, callback) => {
        if(results.block.length === 0) {
          return callback();
        }
        // _expandEvents mutates the event array in the block
        this._expandEvents(results.block[0].block, callback);
      }]
    }, (err, results) => {
      if(err) {
        return callback(err);
      }
      const eventBlock = results.block.length === 1 ? results.block[0] : {};
      callback(null, {eventBlock});
    });
  }

  /**
   * Retrieves a summary of the latest block from the ledger.
   *
   * @param callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the block.
   *     eventBlock - the latest events block summary.
   */
  getLatestSummary(callback) {
    // find the latest config block with consensus
    const query = {
      'block.type': 'WebLedgerEventBlock',
      'meta.deleted': {$exists: false},
      'meta.consensusDate': {$exists: true}
    };
    const projection = {
      _id: 0,
      'block.@context': 1,
      'block.id': 1,
      'block.blockHeight': 1,
      'block.consensusMethod': 1,
      'block.type': 1,
      'block.previousBlock': 1,
      'block.previousBlockHash': 1,
      meta: 1
    };
    const sort = {'block.blockHeight': -1};
    this.collection.find(query, projection).sort(sort).limit(1)
      .toArray((err, result) => {
        if(err) {
          return callback(err);
        }
        const eventBlock = result.length === 1 ? result[0] : {};
        callback(null, {eventBlock});
      });
  }

  /**
   * Update an existing block in the ledger given a block hash, an array of
   * patch instructions, and a set of options.
   *
   * @param blockHash - the hash of the block to update.
   * @param patch - the patch instructions to execute on the block.
   * @param callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  update({blockHash, patch}, callback) {
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
            'NotFoundError', {blockHash: blockHash}));
        }
        callback();
      }]
    }, err => callback(err));
  }

  /**
   * Delete a block in the ledger given a block hash and a set of options.
   *
   * @param blockHash - the hash of the block to delete.
   * @param callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  remove(blockHash, callback) {
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
            'Delete of block failed.', 'NotFoundError', {blockHash}
          ));
        }
        callback();
      }]
    }, callback);
  }

  // FIXME: this might be accomplished with aggregate query
  _expandEvents(block, callback) {
    block.event = [];
    // TODO: make code DRY
    const query = {'meta.blockHeight': block.blockHeight};
    const projection = {_id: 0, 'meta.eventHash': 1};
    this.eventCollection.find(query, projection)
      .sort({'meta.blockOrder': 1})
      .toArray((err, eventHashes) => {
        if(err) {
          return callback(err);
        }
        eventHashes = eventHashes.map(r => r.meta.eventHash);
        // NOTE: getMany preserves order of hashes
        this.eventStorage.getMany({eventHashes}).forEach(({event}) => {
          if(event.type !== 'WebLedgerOperationEvent') {
            // must strip operation
            delete event.operation;
          }
          block.event.push(event);
        }, callback);
      });
  }
};
