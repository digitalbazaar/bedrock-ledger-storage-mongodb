/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const brIdentity = require('bedrock-identity');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const expect = global.chai.expect;
const helpers = require('./helpers');
const jsigs = require('jsonld-signatures');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const baseUri = 'http://example.com';

// use local JSON-LD processor for signatures
jsigs.use('jsonld', bedrock.jsonld);

describe('Block Storage API', () => {
  before(done => {
    helpers.prepareDatabase(mockData, done);
  });
  beforeEach(done => {
    helpers.removeCollection('ledger_testLedger', done);
  });
  describe('regularUser as actor', () => {
    const mockIdentity = mockData.identities.regularUser;
    let actor;
    before(done => {
      brIdentity.get(null, mockIdentity.identity.id, (err, result) => {
        actor = result;
        done(err);
      });
    });
    it.skip('should create block', done => {
      done();
    });
    it.skip('should get block', done => {
      done();
    });
    it.skip('should get latest blocks', done => {
      done();
    });
    it.skip('should update block', done => {
      done();
    });
    it.skip('should delete block', done => {
      done();
    });
    it.skip('should not create block in non-owned ledger', done => {
      done();
    });
    it.skip('should not get block from non-owned ledger', done => {
      done();
    });
    it.skip('should not get latest blocks from non-owned ledger', done => {
      done();
    });
    it.skip('should not update block in non-owned ledger', done => {
      done();
    });
    it.skip('should not delete block in non-owned ledger', done => {
      done();
    });
  });
  describe('admin as actor', () => {
    const mockIdentity = mockData.identities.regularUser;
    let actor;
    before(done => {
      brIdentity.get(null, mockIdentity.identity.id, (err, result) => {
        actor = result;
        done(err);
      });
    });
    it.skip('should create block in any ledger', done => {
      done();
    });
    it.skip('should get block from any ledger', done => {
      done();
    });
    it.skip('should get latest blocks from any ledger', done => {
      done();
    });
    it.skip('should update block in any ledger', done => {
      done();
    });
    it.skip('should delete block in any ledger', done => {
      done();
    });
  });
}); // end createLedger
