/*!
 * Ledger operation storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
// const async = require('async');
// const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
// const logger = require('./logger');
// const {BedrockError} = bedrock.util;

/**
 * The operation API is used to perform operations on operations associated with
 * a particular event.
 */
module.exports = class LedgerOperationStorage {
  constructor({operationCollection}) {
    this.collection = operationCollection;
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
};
