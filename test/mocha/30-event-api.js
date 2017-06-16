/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
/* globals should */
'use strict';

const _ = require('lodash');
const async = require('async');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
const database = require('bedrock-mongodb');
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = 'did:v1:' + uuid.v4();
const configBlockTemplate = {
  id: exampleLedgerId + '/blocks/1',
  ledger: exampleLedgerId,
  type: 'WebLedgerConfigurationBlock',
  consensusMethod: {
    type: 'Continuity2017'
  },
  configurationAuthorizationMethod: {
    type: 'ProofOfSignature2016',
    approvedSigner: [
      'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
    ],
    minimumSignaturesRequired: 1
  },
  writeAuthorizationMethod: {
    type: 'ProofOfSignature2016',
    approvedSigner: [
      'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
    ],
    minimumSignaturesRequired: 1
  },
  signature: {
    type: 'RsaSignature2017',
    created: '2017-10-24T05:33:31Z',
    creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
    domain: 'example.com',
    signatureValue: 'eyiOiJJ0eXAK...EjXkgFWFO'
  }
};

const eventTemplate = {
  id: 'https://example.com/events/123456',
  description: 'Example event',
  signature: {
    type: 'RsaSignature2017',
    created: '2017-05-10T19:47:13Z',
    creator: 'http://example.com/keys/123',
    signatureValue: 'gXI7wqa...FMMJoS2Bw=='
  }
};

describe('Event Storage API', () => {
  let ledgerStorage;
  let counter = 0;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.add(configBlock, meta, options, (err, storage) => {
      ledgerStorage = storage;
      done(err);
    });
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should add event', done => {
    const event = _.cloneDeep(eventTemplate);
    const meta = {};
    const options = {};

    // create the event
    ledgerStorage.events.add(event, meta, options, (err, result) => {
      should.not.exist(err);
      should.exist(result);
      should.exist(result.event);
      should.exist(result.meta);

      // ensure the event was created in the database
      const query = {eventHash: database.hash(result.meta.eventHash)};
      ledgerStorage.events.collection.findOne(query, (err, record) => {
        should.not.exist(err);
        should.exist(record);
        should.exist(record.eventHash);
        should.exist(record.meta);
        should.exist(record.meta.eventHash);
        done();
      });
    });
  });
  it('should not add duplicate event', done => {
    const event = _.cloneDeep(eventTemplate);
    const meta = {};
    const options = {};

    // create the event
    ledgerStorage.events.add(event, meta, options, (err, result) => {
      should.exist(err);
      err.name.should.equal('DuplicateEvent');
      done();
    });
  });
  it('should get event with given hash', done => {
    const event = _.cloneDeep(eventTemplate);
    event.description = counter++;
    const meta = {};
    const options = {};

    // create the event
    ledgerStorage.events.add(event, meta, options, (err, result) => {
      should.not.exist(err);
      const eventHash = result.meta.eventHash;
      // get the event by hash
      ledgerStorage.events.get(eventHash, options, (err, result) => {
        should.not.exist(err);
        result.meta.eventHash.should.equal(eventHash);
        done();
      });
    });
  });
  it('should update event', done => {
    const event = _.cloneDeep(eventTemplate);
    event.description = counter++;
    const meta = {
      testArrayOne: ['a', 'b'],
      testArrayTwo: ['a', 'b', 'c', 'z'],
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(event, callback),
      create: ['hash', (results, callback) =>
        ledgerStorage.events.add(event, meta, options, callback)
      ],
      update: ['create', (results, callback) => {
        const patch = [{
          op: 'unset',
          changes: {
            meta: {
              pending: 1
            }
          }
        }, {
          op: 'set',
          changes: {
            meta: {
              consensus: Date.now()
            }
          }
        }, {
          op: 'add',
          changes: {
            meta: {
              testArrayOne: 'c'
            }
          }
        }, {
          op: 'remove',
          changes: {
            meta: {
              testArrayTwo: 'z'
            }
          }
        }];

        const eventHash = results.create.meta.eventHash;
        ledgerStorage.events.update(eventHash, patch, options, callback);
      }],
      get: ['update', (results, callback) => {
        const eventHash = results.create.meta.eventHash;
        ledgerStorage.events.get(eventHash, options, callback);
      }]
    }, (err, results) => {
      should.not.exist(err);
      should.exist(results.get.meta.consensus);
      should.not.exist(results.get.meta.pending);
      results.get.meta.testArrayOne.should.eql(['a', 'b', 'c']);
      results.get.meta.testArrayTwo.should.eql(['a', 'b', 'c']);
      done();
    });
  });
  it('should fail to update invalid event', done => {
    const eventHash = 'ni:///sha-256;INVALID';
    const options = {};
    const patch = [{
      op: 'unset',
      changes: {
        meta: {
          pending: 1
        }
      }
    }];
    ledgerStorage.events.update(eventHash, patch, options, (err, result) => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
  it('should remove event', done => {
    const event = _.cloneDeep(eventTemplate);
    event.description = counter++;
    const meta = {};
    const options = {};

    // create the event
    async.auto({
      create: callback =>
        ledgerStorage.events.add(event, meta, options, callback),
      delete: ['create', (results, callback) => {
        const eventHash = results.create.meta.eventHash;
        ledgerStorage.events.remove(eventHash, options, callback);
      }]
    }, (err, results) => {
      should.not.exist(err);
      done();
    });
  });
  it('should fail to remove non-existent event', done => {
    const eventHash = 'ni:///sha-256;INVALID';
    const options = {};
    const patch = [{
      op: 'unset',
      changes: {
        meta: {
          pending: 1
        }
      }
    }];
    ledgerStorage.events.remove(eventHash, options, (err, result) => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
});
