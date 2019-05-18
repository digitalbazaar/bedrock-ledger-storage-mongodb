/*!
 * Ledger operation storage class.
 *
 * Copyright (c) 2017-2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const _util = require('./util');
const assert = require('assert-plus');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const logger = require('./logger');
const {util: {callbackify, BedrockError}} = bedrock;

/**
 * The operation API is used to perform operations on operations associated with
 * a particular event.
 * @memberof module:bedrock-ledger-storage-mongodb
 */
class LedgerOperationStorage {
  constructor({eventCollection, ledgerNodeId, operationCollection}) {
    this.collection = operationCollection;
    this.eventCollection = eventCollection;
    this.eventCollectionName = eventCollection.s.name;
    this.ledgerNodeId = ledgerNodeId;
    this.plugins = {};
    // expose utils that can be used in storage plugins
    this.util = {
      assert,
      dbHash: database.hash,
      logger,
      BedrockError
    };

    // FIXME: temporary backwards compatible callback support
    this.addMany = callbackify(this.addMany.bind(this));
    this.exists = callbackify(this.exists.bind(this));
    this.getRecordHistory = callbackify(this.getRecordHistory.bind(this));
  }

  // TODO: document
  async addMany({ignoreDuplicate = true, operations}) {
    const chunks = _util.chunkDocuments(operations);
    for(const chunk of chunks) {
      try {
        await this.collection.insertMany(
          chunk, Object.assign({}, database.writeOptions, {ordered: false}));
      } catch(e) {
        if(ignoreDuplicate && database.isDuplicateError(e)) {
          return;
        }
        throw e;
      }
    }
  }

  /**
   * Determine if operations exist.
   *
   * @param {string|string[]} operationHash the hash of the operation(s).
   * @param {boolean} [explain] return statistics for query profiling.
   * @param {string} [eventHash] the hash of the event associated with the
   *   operation.
   *
   * @return {Promise<boolean>} `true` if all eventHashes exist or
   *   `false` if not.
   */
  async exists({eventHash, explain = false, operationHash}) {
    // NOTE: duplicate opHashes are acceptable, but do not need to be included
    // in the query
    let hashes = [].concat(operationHash);
    const totalHashes = hashes.length;
    hashes = _.uniq(hashes);
    // audit:storage-mongodb/e5f13a2c-0154-4e27-b903-3d612100c69b.md
    const query = {'meta.operationHash': {$in: hashes}};
    if(eventHash) {
      query['meta.eventHash'] = eventHash;
    }
    if(explain) {
      return this.collection.find(query).explain({executionStats: true});
    }
    const count = await this.collection.count(query);
    return count === totalHashes;
  }

  // TODO: document
  // TODO: an optional parameter like
  // `since: {blockHeight: 0, blockOrder: 0, eventOrder: 0}`
  // could be useful if the state machine only needs operations after a certain
  // point
  async getRecordHistory({maxBlockHeight, recordId}) {
    assert.string(recordId, 'recordId');
    if(maxBlockHeight !== undefined && !(Number.isInteger(maxBlockHeight) &&
      maxBlockHeight >= 0)) {
      throw new TypeError('maxBlockHeight must be an integer >= 0.');
    }

    const query = {recordId: database.hash(recordId)};

    const eventMatch = {'meta.eventMeta.consensus': true};
    if(maxBlockHeight) {
      eventMatch['meta.eventMeta.blockHeight'] = {$lte: maxBlockHeight};
    }

    const records = await this.collection.aggregate([
      {$match: query},
      {$project: {_id: 0}},
      {$lookup: {
        from: this.eventCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
          {$project: {
            _id: 0,
            'meta.consensus': 1,
            'meta.blockHeight': 1,
            'meta.blockOrder': 1
          }},
          {$replaceRoot: {newRoot: '$meta'}}
        ],
        as: 'meta.eventMeta'
      }},
      {$unwind: '$meta.eventMeta'},
      {$match: eventMatch},
      {$sort: {
        'meta.eventMeta.blockHeight': 1,
        'meta.eventMeta.blockOrder': 1,
        'meta.eventOrder': 1
      }},
    ], {allowDiskUse: true}).toArray();
    if(records.length === 0) {
      throw new BedrockError(
        'Failed to get history for the specified record.',
        'NotFoundError', {
          httpStatusCode: 404,
          maxBlockHeight,
          public: true,
          recordId
        });
    }
    return records;
  }
}

module.exports = LedgerOperationStorage;
