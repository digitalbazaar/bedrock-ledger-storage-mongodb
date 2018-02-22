/*!
 * Ledger block storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// const _ = require('lodash');
// const async = require('async');
// const bedrock = require('bedrock');
// const database = require('bedrock-mongodb');
// const logger = require('./logger');
// const {BedrockError} = bedrock.util;

/**
 * The operation API is used to perform operations on operationsassociated with
 * a particular event.
 */
module.exports = class LedgerOperationStorage {
  constructor({operationCollection}) {
    this.collection = operationCollection;
  }

  addMany({operations}, callback) {
    this.collection.insertMany(operations, {ordered: false}, err => {
      // TODO: inspect result for dups etc, non-ordered insert does not
      // err on duplicates, it returns dup info in the result
      // what is the situation with dups and operations?
      if(err) {
        return callback(err);
      }
      callback();
    });
  }
};
