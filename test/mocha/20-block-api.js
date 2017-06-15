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

const eventBlockTemplate = {
  id: '',
  type: 'WebLedgerEventBlock',
  event: [{
    '@context': 'https://w3id.org/webledger/v1',
    id: '',
    type: 'WebLedgerEvent',
    operation: 'Create',
    input: [{
      id: 'https://example.com/events/123456',
      description: 'Example event',
      signature: {
        type: 'RsaSignature2017',
        created: '2017-05-10T19:47:13Z',
        creator: 'http://example.com/keys/123',
        signatureValue: 'gXI7wqa...FMMJoS2Bw=='
      }
    }],
    signature: {
      type: 'RsaSignature2017',
      created: '2017-05-10T19:47:15Z',
      creator: 'http://example.com/keys/789',
      signatureValue: 'JoS27wqa...BFMgXIMw=='
    }
  }],
  previousBlock: '',
  previousBlockHash: '',
  signature: {
    type: 'RsaSignature2017',
    created: '2017-10-24T05:33:31Z',
    creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
    domain: 'example.com',
    signatureValue: 'eyiOiJJ0eXAK...WFOEjXkgF'
  }
};

describe('Block Storage API', () => {
  let ledgerStorage;

  before(done => {
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {
      eventHasher: helpers.testHasher,
      blockHasher: helpers.testHasher
    };

    blsMongodb.create(configBlock, meta, options, (err, storage) => {
      ledgerStorage = storage;
      done(err);
    });
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should create block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      consensus: Date.now()
    };
    const options = {};

    // create the block
    ledgerStorage.blocks.create(eventBlock, meta, options, (err, result) => {
      should.not.exist(err);
      should.exist(result);
      should.exist(result.block);
      should.exist(result.meta);

      // ensure the block was created in the database
      const query = {id: database.hash(eventBlock.id)};
      ledgerStorage.blocks.collection.findOne(query, (err, record) => {
        should.not.exist(err);
        should.exist(record);
        should.exist(record.id);
        should.exist(record.block.id);
        should.exist(record.meta.consensus);
        done();
      });
    });
  });
  it('should not create duplicate block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    ledgerStorage.blocks.create(eventBlock, meta, options, (err, result) => {
      should.exist(err);
      err.name.should.equal('DuplicateBlock');
      done();
    });
  });
  it('should get consensus block with given ID', done => {
    const blockId = exampleLedgerId + '/blocks/2';
    const options = {};

    // get an existing consensus block
    ledgerStorage.blocks.get(blockId, options, (err, result) => {
      should.not.exist(err);
      should.exist(result.block);
      should.exist(result.meta);
      result.block.id.should.equal(exampleLedgerId + '/blocks/2');
      done();
    });
  });
  it('should get all blocks with given ID', done => {
    const blockId = exampleLedgerId + '/blocks/2';
    const options = {};

    // get an existing block
    ledgerStorage.blocks.getAll(blockId, options, (err, iterator) => {
      should.not.exist(err);
      should.exist(iterator);

      let blockCount = 0;
      async.eachSeries(iterator, (promise, callback) => {
        promise.then(result => {
          should.exist(result.block);
          should.exist(result.meta);
          result.block.id.should.equal(exampleLedgerId + '/blocks/2');
          blockCount++;
          callback();
        }, callback);
      }, err => {
        blockCount.should.equal(1);
        done(err);
      });
    });
  });
  it('should fail to get non-existent block', done => {
    const blockId = exampleLedgerId + '/blocks/INVALID';
    const options = {};

    // attempt to get non-existent block
    let blockCount = 0;
    ledgerStorage.blocks.get(blockId, options, (err, iterator) => {
      async.eachSeries(iterator, (promise, callback) => {
        promise.then(result => {
          should.not.exist(result);
          blockCount++;
          callback();
        }, callback);
      }, err => {
        should.not.exist(err);
        blockCount.should.equal(0);
        done(err);
      });
    });
  });
  it('should update block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/4';
    eventBlock.event[0].id = exampleLedgerId + '/events/3';
    const meta = {
      testArrayOne: ['a', 'b'],
      testArrayTwo: ['a', 'b', 'c', 'z'],
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      create: ['hash', (results, callback) =>
        ledgerStorage.blocks.create(eventBlock, meta, options, callback)
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

        ledgerStorage.blocks.update(results.hash, patch, options, callback);
      }],
      get: ['update', (results, callback) => {
        ledgerStorage.blocks.get(eventBlock.id,options, callback);
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
  it('should fail to update invalid block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/INVALID';
    eventBlock.event[0].id = exampleLedgerId + '/events/INVALID';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      update: ['hash', (results, callback) => {
        const patch = [{
          op: 'unset',
          changes: {
            meta: {
              pending: 1
            }
          }
        }];

        ledgerStorage.blocks.update(results.hash, patch, options, callback);
      }],
      get: ['update', (results, callback) => {
        ledgerStorage.blocks.get(eventBlock.id,options, callback);
      }]
    }, (err, results) => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
  it('should delete block', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/5';
    eventBlock.event[0].id = exampleLedgerId + '/events/4';
    const meta = {
      pending: true
    };
    const options = {};

    // create the block
    async.auto({
      hash: callback => helpers.testHasher(eventBlock, callback),
      create: ['hash', (results, callback) =>
        ledgerStorage.blocks.create(eventBlock, meta, options, callback)
      ],
      delete: ['create', (results, callback) => {
        ledgerStorage.blocks.delete(results.hash, options, callback);
      }]
    }, (err, results) => {
      should.not.exist(err);
      done();
    });
  });
  it('should fail to delete non-existent block', done => {
    const eventBlockHash = 'INVALID HASH';
    const options = {};

    // delete the block
    ledgerStorage.blocks.delete(eventBlockHash, options, (err) => {
      should.exist(err);
      err.name.should.equal('NotFound');
      done();
    });
  });
  it('should get latest blocks', done => {
    // get latest config and event blocks
    const options = {};
    ledgerStorage.blocks.getLatest(options, (err, result) => {
      should.not.exist(err);
      should.exist(result.configurationBlock);
      should.exist(result.eventBlock);
      done();
    });
  });
});
