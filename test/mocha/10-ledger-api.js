/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const jsigs = require('jsonld-signatures');
const uuid = require('uuid/v4');

const testOwner = 'https://example.com/i/testOwner';

// use local JSON-LD processor for signatures
jsigs.use('jsonld', bedrock.jsonld);

describe('Ledger Storage API', () => {
  it('should add a ledger', done => {
    const meta = {};
    const options = {
      ledgerId: `did:v1:${uuid()}`,
      ledgerNodeId: `urn:uuid:${uuid()}`,
    };

    async.auto({
      add: callback => blsMongodb.add(meta, options, callback),
      ensureStorage: ['add', (results, callback) => {
        const storage = results.add;
        // ensure ledger storage API exists
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);

        // ensure the ledger was created in the database
        const query = {id: storage.id};
        database.collections.ledger.findOne(query, callback);
      }],
      ensureLedger: ['ensureStorage', (results, callback) => {
        const record = results.ensureStorage;
        should.exist(record);
        should.exist(record.ledger.id);
        should.exist(record.ledger.eventCollection);
        should.exist(record.ledger.blockCollection);
        callback();
      }]}, err => done(err));
  });
  it('should get ledger', done => {
    const meta = {};
    const options = {
      ledgerId: `did:v1:${uuid()}`,
      ledgerNodeId: `urn:uuid:${uuid()}`,
    };

    async.auto({
      add: callback => blsMongodb.add(meta, options, callback),
      get: ['add', (results, callback) => {
        const storage = results.add;
        blsMongodb.get(storage.id, options, callback);
      }],
      ensureGet: ['get', (results, callback) => {
        const storage = results.get;
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);
        should.exist(storage.operations);
        callback();
      }]}, err => done(err));
  });
  it('should fail to get non-existent ledger', done => {
    const storageId = 'urn:uuid:INVALID';
    const options = {};

    blsMongodb.get(storageId, options, (err, storage) => {
      should.exist(err);
      should.not.exist(storage);
      err.name.should.equal('NotFoundError');
      done();
    });
  });
  it('should iterate over ledgers', done => {
    let ledgerCount = 3;
    const ledgerIds = Array(3).fill().map(() => {
      return 'did:v1:' + uuid();
    });
    const storageIds = [];
    async.every(ledgerIds, (ledgerId, callback) => {
      const meta = {};
      const options = {ledgerId, ledgerNodeId: `urn:uuid:${uuid()}`};
      blsMongodb.add(meta, options, (err, storage) => {
        assertNoError(err);
        storageIds.push(storage.id);
        callback(err, true);
      });
    }, err => {
      assertNoError(err);

      // iterate through all of the ledger IDs
      const options = {owner: testOwner + '-iterator'};
      blsMongodb.getLedgerIterator(options, (err, iterator) => {
        assertNoError(err);
        ledgerCount = 0;
        async.eachSeries(iterator, (promise, callback) => {
          promise.then(storage => {
            if(storageIds.indexOf(storage.id) !== -1) {
              ledgerCount++;
            }
            callback();
          }, callback);
        }, err => {
          ledgerCount.should.equal(3);
          done(err);
        });
      });
    });
  });
  it('should remove a ledger', done => {
    const meta = {};
    const options = {
      ledgerId: 'did:v1:' + uuid(),
      ledgerNodeId: `urn:uuid:${uuid()}`,
      owner: testOwner,
    };

    async.auto({
      add: callback => blsMongodb.add(meta, options, callback),
      get: ['add', (results, callback) => {
        const storage = results.add;
        blsMongodb.get(storage.id, options, callback);
      }],
      ensureGet: ['get', (results, callback) => {
        const storage = results.get;
        should.exist(storage);
        should.exist(storage.blocks);
        should.exist(storage.events);
        callback();
      }],
      remove: ['ensureGet', (results, callback) => {
        const storage = results.get;
        blsMongodb.remove(storage.id, options, err => {
          assertNoError(err);
          callback();
        });
      }],
      ensureGone: ['remove', (results, callback) => {
        const storage = results.get;
        blsMongodb.get(storage.id, options, (err, storage) => {
          should.exist(err);
          should.not.exist(storage);
          err.name.should.equal('NotFoundError');
          callback();
        });
      }]}, err => done(err));
  });
});
