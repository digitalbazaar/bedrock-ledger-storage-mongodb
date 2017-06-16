/*
 * Copyright (c) 2016 Digital Bazaar, Inc. All rights reserved.
 */
/* jshint node: true */
'use strict';

var async = require('async');
const bedrock = require('bedrock');
var brIdentity = require('bedrock-identity');
const config = require('bedrock').config;
const crypto = require('crypto');
var database = require('bedrock-mongodb');
let jsonld = bedrock.jsonld;
const jsigs = require('jsonld-signatures')();
let request = require('request');
var uuid = require('uuid').v4;

var api = {};
module.exports = api;

// ensure that requests always send JSON
request = request.defaults({json: true});

// FIXME: Do not use an insecure document loader in production
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
// test hashing function
api.testHasher = function (data, callback) {
  // ensure a basic context exists
  if(!data['@context']) {
    data['@context'] = 'https://w3id.org/webledger/v1';
  }

  jsonld.normalize(data, {
    algorithm: 'URDNA2015',
    format: 'application/nquads'
  }, function(err, normalized) {
    const hash = crypto.createHash('sha256').update(normalized).digest()
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    callback(err, hash);
  });
}

api.createIdentity = function(userName) {
  var newIdentity = {
    id: 'did:' + uuid(),
    type: 'Identity',
    sysSlug: userName,
    label: userName,
    email: userName + '@bedrock.dev',
    sysPassword: 'password',
    sysPublic: ['label', 'url', 'description'],
    sysResourceRole: [],
    url: 'https://example.com',
    description: userName,
    sysStatus: 'active'
  };
  return newIdentity;
};

api.removeCollection = function(collection, callback) {
  var collectionNames = [collection];
  database.openCollections(collectionNames, () => {
    async.each(collectionNames, function(collectionName, callback) {
      database.collections[collectionName].remove({}, callback);
    }, function(err) {
      callback(err);
    });
  });
};

api.removeCollections = function(callback) {
  var collectionNames = ['identity', 'eventLog'];
  database.openCollections(collectionNames, () => {
    async.each(collectionNames, (collectionName, callback) => {
      database.collections[collectionName].remove({}, callback);
    }, function(err) {
      callback(err);
    });
  });
};

api.prepareDatabase = function(mockData, callback) {
  async.series([
    callback => {
      api.removeCollections(callback);
    },
    callback => {
      insertTestData(mockData, callback);
    }
  ], callback);
};

api.getEventNumber = function(eventId) {
  return Number(eventId.substring(eventId.lastIndexOf('/') + 1));
};

// Insert identities and public keys used for testing into database
function insertTestData(mockData, callback) {
  async.forEachOf(mockData.identities, (identity, key, callback) => {
    brIdentity.insert(null, identity.identity, callback);
  }, err => {
    if(err) {
      if(!database.isDuplicateError(err)) {
        // duplicate error means test data is already loaded
        return callback(err);
      }
    }
    callback();
  }, callback);
}
