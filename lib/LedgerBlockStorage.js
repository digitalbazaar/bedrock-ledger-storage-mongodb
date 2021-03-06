/*!
 * Ledger block storage class.
 *
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const logger = require('./logger');
const {BedrockError} = bedrock.util;
const {promisify} = require('util');

/**
 * The blocks API is used to perform operations on blocks associated with a
 * particular ledger.
 * @memberof module:bedrock-ledger-storage-mongodb
 */
class LedgerBlockStorage {
  constructor({blockCollection, eventCollection, eventStorage, ledgerNodeId}) {
    // assign the collection used for block storage
    this.collection = blockCollection;
    // assign the collection used for events storage
    this.eventCollection = eventCollection;
    // event storage API
    this.eventStorage = eventStorage;
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
   * Adds a block in the ledger given a block, metadata associated with the
   * block.
   *
   * @param block - the block to create in the ledger.
   *   blockHeight - the height of the block.
   *   event - an array of events associated with the block.
   * @param emit - when true (default), a bedrock event is emitted to inform
   *  listeners that a block has been added.
   * @param meta - the metadata associated with the block.
   *   blockHash - the hash value of the block.
   *
   * @return a Promise that resolves to an object with:
   *   block - the block that was committed to storage.
   *   meta - the metadata that was committed to storage.
   */
  async add({block, emit = true, meta}) {
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

    // NOTE: `meta.consensus` and `meta.consensusDate` are to be managed
    // by consensus algorithms and therefore are not validated here
    // audit:storage-mongodb/819d5876-c76e-4cb6-89ee-be7328b83430.md
    const query = {
      'meta.blockHeight': blockHeight,
      'meta.eventHash': {$in: event},
    };
    const eventCount = await this.eventCollection.countDocuments(query);

    // failure
    if(eventCount !== event.length) {
      throw new BedrockError(
        'Some events have not been properly assigned to the block.',
        'InvalidStateError', {block: _block, event});
    }

    // insert the block
    const now = Date.now();
    const record = {
      block: _block,
      id: database.hash(_block.id),
      meta: _.defaults(meta, {
        created: now,
        updated: now
      }),
    };

    logger.debug(`adding block: ${meta.blockHash}`);
    let insertedRecord;
    try {
      insertedRecord = (await this.collection.insertOne(
        record, database.writeOptions)).ops[0];
    } catch(e) {
      if(!database.isDuplicateError(e)) {
        throw e;
      }
      throw new BedrockError(
        'A block with the same hash already exists.',
        'DuplicateError', {blockHash: meta.blockHash}, e);
    }
    if(emit) {
      await bedrock.events.emit('bedrock-ledger-storage.block.add', {
        blockHeight,
        ledgerNodeId: this.ledgerNodeId
      });
    }

    return {block: insertedRecord.block, meta: insertedRecord.meta};
  }

  /**
   * Gets the block that has consensus given a blockId.
   *
   * @param blockId - the identifier of the block that has consensus.
   * @param [consensus] `false` to retrieve a non-consensus block instead.
   *
   * @return a Promise that resolves to the block with the given ID that
   *   has consensus.
   */
  async get({blockId, consensus = true}) {
    // find an existing block with consensus
    // audit:storage-mongodb/646f54f5-ac4e-40d3-abe7-0af35449c3d1.md
    const query = {
      id: database.hash(blockId),
      'meta.consensus': consensus
    };
    const projection = {_id: 0};
    const record = await this.collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError(
        'A block with the given ID does not exist.',
        'NotFoundError', {blockId});
    }
    const {block, meta} = record;
    // _expandEvents mutates the parameter
    await this._expandEvents(block);
    return {block, meta};
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
   *
   * @return a Promise that resolves to the block summary for the given ID that
   *   has consensus.
   */
  async getSummary({blockId, consensus = true, eventHash = false}) {
    const query = {
      id: database.hash(blockId),
      'meta.consensus': consensus
    };
    const projection = {_id: 0};
    const record = await this.collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError(
        'A block with the given ID does not exist.',
        'NotFoundError', {blockId});
    }
    const {block, meta} = record;

    if(eventHash) {
      // FIXME: this might be accomplished with aggregate query
      // get event hashes
      const query = {'meta.blockHeight': block.blockHeight};
      const projection = {_id: 0, 'meta.eventHash': 1};
      block.eventHash = (await this.eventCollection.find(query, {projection})
        .sort({'meta.blockOrder': 1})
        .toArray())
        .map(r => r.meta.eventHash);
    }

    return {block, meta};
  }

  /**
   * Gets a block that has consensus given a blockHeight.
   *
   * @param blockHeight - the height of the block that has consensus.
   *
   * @return a Promise that resolves to the block with the given block height
   *   that has consensus.
   */
  async getByHeight(blockHeight) {
    // find an existing block with consensus
    const query = {
      'block.blockHeight': blockHeight,
      'meta.consensus': true
    };
    const projection = {_id: 0};
    const record = await this.collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError(
        'A block with the given `blockHeight` does not exist.',
        'NotFoundError', {blockHeight});
    }
    // mutates parameter
    await this._expandEvents(record.block);
    return {block: record.block, meta: record.meta};
  }

  /**
   * Gets the block summary for consensus block given a blockHeight.
   *
   * @param blockHeight - the height of the block that has consensus.
   * @param [consensus] `false` to retrieve a summary for a non-consensus
   * @param [eventHash] `true` to get all event hashes from `event`.
   *
   * @return a Promise that resolves to the block summary for the given ID
   *   that has consensus.
   */
  async getSummaryByHeight(
    {blockHeight, consensus = true, eventHash = false}) {
    const query = {
      'block.blockHeight': blockHeight,
      'meta.consensus': consensus
    };
    const projection = {_id: 0};
    const record = await this.collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError(
        'A block with the given block height does not exist.',
        'NotFoundError', {blockHeight});
    }
    const {block, meta} = record;
    if(eventHash) {
      // TODO: make code DRY
      // FIXME: this might be accomplished with aggregate query
      // get event hashes
      const query = {'meta.blockHeight': block.blockHeight};
      const projection = {_id: 0, 'meta.eventHash': 1};
      const records = await this.eventCollection.find(query, {projection})
        .sort({'meta.blockOrder': 1})
        .toArray();
      block.eventHash = records.map(r => r.meta.eventHash);
    }
    return {block, meta};
  }

  /**
   * Retrieves the genesis block from the ledger.
   *
   * @return a Promise that resolves to the result with the genesis block:
   *   genesisBlock - the genesis block and its meta.
   */
  async getGenesis() {
    // find the genesis block with consensus
    const query = {
      'block.blockHeight': 0,
      'meta.consensus': true
    };
    const projection = {_id: 0};
    const record = await this.collection.findOne(query, {projection});
    if(!record) {
      throw new BedrockError(
        'The genesis block does not exist.',
        'NotFoundError');
    }
    const {block, meta} = record;
    // NOTE: _expandEvents mutates record.block
    await this._expandEvents(block);
    return {genesisBlock: {block, meta}};
  }

  /**
   * Retrieves the latest block from the ledger.
   *
   * @return a Promise that resolves to the block:
   *   eventBlock - the latest events block and meta.
   */
  async getLatest() {
    // audit:storage-mongodb/2ed084c3-ec0b-4e4d-8371-8d788c2e2234.md
    const query = {'meta.consensus': true};
    const projection = {_id: 0};
    const sort = {'block.blockHeight': -1};
    const records = await this.collection.find(query, {projection})
      .sort(sort).limit(1).toArray();
    if(records.length === 0) {
      return {eventBlock: {}};
    }
    // _expandEvents mutates the event array in the block
    await this._expandEvents(records[0].block);
    return {eventBlock: records[0]};
  }

  /**
   * Retrieves the latest block height for the ledger.
   *
   * @param {object} [options] - The options to use.
   * @param {Boolean} [options.explain=false] - Return query stats.
   * @return {Promise<Number|object>} the latest block height for the ledger
   *   or the query stats.
   */
  async getLatestBlockHeight({explain = false} = {}) {
    const query = {'meta.consensus': true};
    const projection = {_id: 0, 'block.blockHeight': 1};
    const sort = {'block.blockHeight': -1};
    const cursor = this.collection.find(query, {projection}).sort(sort)
      .limit(1);
    if(explain) {
      return cursor.explain('executionStats');
    }
    const records = await cursor.toArray();
    if(records.length === 0) {
      throw new BedrockError(
        'There are no blocks for the ledger.',
        'NotFoundError');
    }
    const [{block: {blockHeight}}] = records;
    return blockHeight;
  }

  /**
   * Retrieves a summary of the latest block from the ledger.
   *
   * @return a Promise that resolves to the block:
   *   eventBlock - the latest events block summary.
   */
  async getLatestSummary() {
    // find the latest config block with consensus
    // audit:storage-mongodb/2ed084c3-ec0b-4e4d-8371-8d788c2e2234.md
    const query = {'meta.consensus': true};
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
    const [eventBlock = {}] = await this.collection.find(query, {projection})
      .sort(sort).limit(1).toArray();
    return {eventBlock};
  }

  /**
   * Update an existing block in the ledger given a block hash, an array of
   * patch instructions, and a set of options.
   *
   * @param blockHash - the hash of the block to update.
   * @param patch - the patch instructions to execute on the block.
   */
  async update({blockHash, patch}) {
    if(!Array.isArray(patch)) {
      throw new TypeError('"patch" must be an array.');
    }

    // TODO: change to use fast-json-patch
    const setObject = {};
    const unsetObject = {};
    const pushFields = {};
    const pullFields = {};

    for(const operation of patch) {
      // ensure that only meta fields are modified
      const opLength = Object.keys(operation.changes).length;
      if(opLength !== 1 ||
        (opLength === 1 && operation.changes.meta === undefined)) {
        throw new BedrockError(
          'Only block meta can be updated.',
          'NotAllowedError', {operation});
      }

      // process set, unset, add, and remove operations
      if(operation.op === 'set') {
        _.extend(setObject, operation.changes);
      } else if(operation.op === 'unset') {
        _.extend(unsetObject, operation.changes);
      } else if(operation.op === 'add') {
        const arrayUpdate = database.buildUpdate(operation.changes);
        const field = Object.keys(arrayUpdate)[0];
        if(field in pushFields) {
          pushFields[field].$each.push(arrayUpdate[field]);
        } else {
          pushFields[field] = {$each: [arrayUpdate[field]]};
        }
      } else if(operation.op === 'remove') {
        const arrayUpdate = database.buildUpdate(operation.changes);
        const field = Object.keys(arrayUpdate)[0];
        if(field in pullFields) {
          pullFields[field].push(arrayUpdate[field]);
        } else {
          pullFields[field] = [arrayUpdate[field]];
        }
      }
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
    const result = await this.collection.updateOne(
      {'meta.blockHash': blockHash}, update, database.writeOptions);
    if(result.result.n === 0) {
      throw new BedrockError(
        'Could not update block. Block with given hash not found.',
        'NotFoundError', {blockHash});
    }
  }

  /**
   * Delete a block in the ledger given a block hash and a set of options.
   *
   * @param blockHash - the hash of the block to delete.
   */
  async remove(blockHash) {
    // find and delete the existing block
    const filter = {
      'meta.blockHash': blockHash
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
    const result = await this.collection.updateOne(filter, update);
    if(result.matchedCount !== 1) {
      throw new BedrockError(
        'Failed to remove block; block not found.',
        'NotFoundError', {blockHash});
    }
  }

  async _expandEvents(block) {
    block.event = [];
    const {blockHeight} = block;
    // TODO: update driver to get `promise` from `.forEach`
    const cursor = this.eventStorage.getMany({blockHeight});
    const fn = promisify(cursor.forEach.bind(cursor));
    await fn(({event}) => block.event.push(event));
  }
}

module.exports = LedgerBlockStorage;
