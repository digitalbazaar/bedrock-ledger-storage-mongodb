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

describe('Event Storage API', () => {
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
    it.skip('should create event', done => {
      done();
    });
    it.skip('should get event', done => {
      done();
    });
    it.skip('should update event', done => {
      done();
    });
    it.skip('should delete event', done => {
      done();
    });
    it.skip('should not create event in non-owned ledger', done => {
      done();
    });
    it.skip('should not get event from non-owned ledger', done => {
      done();
    });
    it.skip('should not update event in non-owned ledger', done => {
      done();
    });
    it.skip('should not delete event in non-owned ledger', done => {
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
    it.skip('should create event in any ledger', done => {
      done();
    });
    it.skip('should get event from any ledger', done => {
      done();
    });
    it.skip('should update event in any ledger', done => {
      done();
    });
    it.skip('should delete event in any ledger', done => {
      done();
    });
  });
}); // end createLedger
