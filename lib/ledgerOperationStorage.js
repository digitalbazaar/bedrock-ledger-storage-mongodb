/*!
 * Ledger operation storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
// const async = require('async');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
// const logger = require('./logger');
const {BedrockError} = bedrock.util;

/**
 * The operation API is used to perform operations on operations associated with
 * a particular event.
 */
module.exports = class LedgerOperationStorage {
  constructor({eventCollection, ledgerNodeId, operationCollection}) {
    this.collection = operationCollection;
    this.eventCollection = eventCollection;
    this.eventCollectionName = eventCollection.s.name;
    this.ledgerNodeId = ledgerNodeId;
  }

  addMany({ignoreDuplicate = true, operations}, callback) {
    this.collection.insertMany(
      operations, _.assign({}, database.writeOptions, {ordered: false}),
      (err, result) => {
        if(err && ignoreDuplicate && database.isDuplicateError(err)) {
          return callback(null, result);
        }
        if(err) {
          return callback(err);
        }
        callback(null, result);
      });
  }

  // TODO: an optional parameter like
  // `since: {blockHeight: 0, blockOrder: 0, eventOrder: 0}`
  // could be useful if the state machine only needs operations after a certain
  // point
  getRecordHistory({maxBlockHeight, recordId}, callback) {
    assert.string(recordId, 'recordId');
    if(maxBlockHeight !== undefined && !(Number.isInteger(maxBlockHeight) &&
      maxBlockHeight > 0)) {
      throw new TypeError('maxBlockHeight must be a positive integer.');
    }

    const query = {recordId: database.hash(recordId)};

    const eventMatch = {'meta.eventMeta.consensus': {$exists: true}};
    if(maxBlockHeight) {
      eventMatch['meta.eventMeta.blockHeight'] = {$lte: maxBlockHeight};
    }

    this.collection.aggregate([
      {$match: query},
      {$project: {_id: 0}},
      {$lookup: {
        from: this.eventCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$eventHash', '$$eventHash']}}},
          {$project: {
            _id: 0,
            'meta.consensus': 1,
            'meta.blockHeight': 1,
            'meta.blockOrder': 1
          }},
          {$replaceRoot: {newRoot: "$meta"}}
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
    ], {allowDiskUse: true}).toArray((err, result) => {
      if(err) {
        return callback(err);
      }
      if(result.length === 0) {
        return callback(new BedrockError(
          'Failed to get history for the specified record.',
          'NotFoundError', {
            httpStatusCode: 404,
            maxBlockHeight,
            public: true,
            recordId
          }));
      }
      callback(null, result);
    });
  }

  /**
   * Determine if operations exist.
   *
   * @param eventHash the hash of the event associated with the operation
   * @param operationHash the hash or array of hashes of the operation(s).
   * @param callback(err, result) called once the operation completes.
   */
  exists({eventHash, operationHash}, callback) {
    // NOTE: duplicate opHashes are acceptable, but do not need to be included
    // in the query
    let hashes = [].concat(operationHash);
    const totalHashes = hashes.length;
    hashes = _.uniq(hashes);
    const query = {
      'meta.deleted': {$exists: false},
      'meta.eventHash': database.hash(eventHash),
      'meta.eventOrder': {$exists: true},
      'meta.operationHash': {$in: hashes},
    };
    this.collection.find(query).count((err, result) =>
      err ? callback(err) : callback(null, totalHashes === result));
  }

  query({maxBlockHeight, query}, callback) {
    assert.number(maxBlockHeight, 'maxBlockHeight');
    assert.object(query, 'query');

    const {eventCollection, collection: operationCollection} = this;
    const eventQuery = {
      'event.type': 'WebLedgerOperationEvent',
      'meta.blockHeight': {$lte: maxBlockHeight},
      'meta.consensus': {$exists: true},
    };
    const operationMatch = {
      $and: [
        {$in: ['$meta.eventHash', '$$eventHashes']}
      ]
    };
    Object.keys(query).forEach(k => {
      if(Array.isArray(query[k])) {
        operationMatch.$and.push({$in: [`$operation.record.${k}`, query[k]]});
      } else if(k === 'id') {
        operationMatch.$and.push({$eq: ['$recordId', database.hash(query[k])]});
      } else {
        operationMatch.$and.push({$eq: [`$operation.record.${k}`, query[k]]});
      }
    });
    console.log('QQQQQ', JSON.stringify(operationMatch, null, 2));
    eventCollection.aggregate([
      {$match: eventQuery},
      {$project: {_id: 0, eventHash: 1}},
      {$group: {
        _id: null,
        eventHashes: {$addToSet: '$eventHash'}
      }},
      {$lookup: {
        from: operationCollection.s.name,
        let: {eventHashes: '$eventHashes'},
        pipeline: [
          {$match: {$expr: operationMatch}},
          {$project: {_id: 0, 'operation.record.id': 1}},
          {$group: {_id: null, records: {
            $addToSet: '$operation.record.id'
          }}},
          {$project: {_id: 0}},
        ],
        as: 'records',
      }},
      {$project: {records: {$arrayElemAt: ['$records', 0]}}},
      {$replaceRoot: {newRoot: '$records'}}
    ]).toArray((err, result) => {
      if(err) {
        return callback(err);
      }
      console.log('8888888', JSON.stringify(result, null, 2));
      callback();
    });
  }
};
