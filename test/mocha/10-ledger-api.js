/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const {util: {uuid}} = require('bedrock');
const testOwner = 'https://example.com/i/testOwner';

describe('Ledger Storage API', function() {
  it('should add a ledger', async () => {
    const meta = {};
    const options = {
      ledgerId: `did:v1:${uuid()}`,
      ledgerNodeId: `urn:uuid:${uuid()}`,
    };

    const storage = await blsMongodb.add(meta, options);
    // ensure ledger storage API exists
    should.exist(storage);
    should.exist(storage.blocks);
    should.exist(storage.events);
    should.exist(storage.operations);

    // ensure the ledger was created in the database
    const query = {id: storage.id};
    const record = await database.collections.ledger.findOne(query);
    should.exist(record);
    should.exist(record.id);
    record.id.should.be.a('string');
    should.exist(record.ledger.id);
    record.ledger.id.should.be.a('string');
    should.exist(record.ledger.ledgerNode);
    record.ledger.ledgerNode.should.be.a('string');
    should.exist(record.ledger.collections);
    const {collections} = record.ledger;
    collections.should.be.an('object');
    should.exist(collections.block);
    collections.block.should.be.a('string');
    should.exist(collections.event);
    collections.event.should.be.a('string');
    should.exist(collections.operation);
    collections.operation.should.be.a('string');
    should.exist(record.ledger.plugins);
    record.ledger.plugins.should.be.an('array');
    record.ledger.plugins.should.have.length(0);
    should.exist(record.meta);
    record.meta.should.be.an('object');
    should.exist(record.meta.created);
    should.exist(record.meta.updated);
  });
  it('should get ledger', async () => {
    const meta = {};
    const options = {
      ledgerId: `did:v1:${uuid()}`,
      ledgerNodeId: `urn:uuid:${uuid()}`,
    };

    let storage = await blsMongodb.add(meta, options);
    storage = await blsMongodb.get(storage.id, options);
    should.exist(storage);
    should.exist(storage.blocks);
    should.exist(storage.events);
    should.exist(storage.operations);
  });
  it('should fail to get non-existent ledger', async () => {
    const storageId = 'urn:uuid:INVALID';
    const options = {};
    let err;
    try {
      await blsMongodb.get(storageId, options);
    } catch(e) {
      err = e;
    }
    should.exist(err);
    err.name.should.equal('NotFoundError');
  });
  // NOTE: this test succeeds, but can take upwards of a minute to complete
  it('should iterate over ledgers', function(done) {
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
