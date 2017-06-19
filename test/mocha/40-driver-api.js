/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configBlockTemplate = mockData.configBlocks.alpha;
configBlockTemplate.id = exampleLedgerId + '/blocks/1';
configBlockTemplate.ledger = exampleLedgerId;

describe('Ledger Storage Driver API', () => {
  let ledgerStorage;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {};

    helpers.testHasher(configBlock, (err, hash) => {
      should.not.exist(err);
      meta.blockHash = hash;
      blsMongodb.add(configBlock, meta, options, (err, storage) => {
        ledgerStorage = storage;
        done(err);
      });
    });
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should be able to retrieve the driver', done => {
    should.exist(ledgerStorage.driver);
    done();
  });
  it('should be able to perform a query', done => {
    const query = {
      'ledger.id': ledgerStorage.id
    };
    ledgerStorage.driver.collections.ledger.findOne(query, (err, result) => {
      should.not.exist(err);
      result.ledger.id.should.equal(ledgerStorage.id);
      done();
    });
  });
  it('should be able to perform a write', done => {
    const filter = {
      'ledger.id': ledgerStorage.id
    };
    const update = {
      $set: {
        meta: {
          test: true
        }
      }
    };
    const lc = ledgerStorage.driver.collections.ledger;
    lc.updateOne(filter, update, (err, result) => {
      should.not.exist(err);
      result.matchedCount.should.equal(1);
      done();
    });
  });
}); // end createLedger
