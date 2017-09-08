/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configEventTemplate = _.cloneDeep(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = _.cloneDeep(mockData.configBlocks.alpha);
configBlockTemplate.event = [configEventTemplate];
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

describe('Ledger Storage Driver API', () => {
  let ledgerStorage;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {ledgerId: exampleLedgerId};

    async.auto({
      initStorage: callback => blsMongodb.add(
        meta, options, (err, storage) => {
          ledgerStorage = storage;
          callback(err, storage);
        }),
      hashConfig: callback => helpers.testHasher(configBlock, callback),
      addConfigBlock: ['initStorage', 'hashConfig', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
        meta.blockHash = results.hashConfig;
        meta.consensus = Date.now();
        ledgerStorage.blocks.add(configBlock, meta, {}, callback);
      }]
    }, done);
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
});
