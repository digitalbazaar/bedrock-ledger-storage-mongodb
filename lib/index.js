/*!
 * Ledger storage module.
 *
 * Copyright (c) 2016-2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
// const brPermission = require('bedrock-permission');
const config = require('bedrock').config;
const crypto = require('crypto');
const database = require('bedrock-mongodb');
const jsigs = require('jsonld-signatures')();
let jsonld = bedrock.jsonld;
let request = require('request');
const BedrockError = bedrock.util.BedrockError;

require('./config');

// module permissions
const PERMISSIONS = bedrock.config.permission.permissions;

// module API
const api = {};
module.exports = api;

// const logger = bedrock.loggers.get('app');

// ensure that requests always send JSON
request = request.defaults({json: true});

// FIXME: Do not use an insecure document loader in production
// jsonld = jsonld();
const nodeDocumentLoader = jsonld.documentLoaders.node({
  secure: false,
  strictSSL: false
});
jsonld.documentLoader = (url, callback) => {
  if(url in config.constants.CONTEXTS) {
    return callback(
      null, {
        contextUrl: null,
        document: config.constants.CONTEXTS[url],
        documentUrl: url
      });
  }
  nodeDocumentLoader(url, callback);
};

// use local JSON-LD processor for checking signatures
jsigs.use('jsonld', jsonld);

bedrock.events.on('bedrock-mongodb.ready', callback => async.auto({
  openCollections: callback => database.openCollections(['ledger'], callback),
  createIndexes: ['openCollections', (results, callback) =>
    database.createIndexes([{
      collection: 'ledger',
      fields: {id: 1},
      options: {unique: true, background: false}
    }], callback)
  ],
  createKeys: ['createIndexes', (results, callback) => {
    // FIXME: open all existing ledgers
    callback();
  }]
}, err => callback(err)));
