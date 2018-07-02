/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const async = require('async');
const bedrock = require('bedrock');
const blsMongodb = require('bedrock-ledger-storage-mongodb');
// const database = require('bedrock-mongodb');
// const {expect} = global.chai;
const helpers = require('./helpers');
const mockData = require('./mock.data');
const uuid = require('uuid/v4');

const exampleLedgerId = `did:v1:${uuid()}`;
const exampleLedgerNodeId = `urn:uuid:${uuid()}`;
const configEventTemplate = bedrock.util.clone(mockData.events.config);
configEventTemplate.ledger = exampleLedgerId;

const configBlockTemplate = bedrock.util.clone(mockData.configBlocks.alpha);
configBlockTemplate.id = exampleLedgerId + '/blocks/1';

// mock plugin
blsMongodb.use('foo', {
  type: 'service',
  api: {
    index: async ({createIndexes, collections}) => {
      should.exist(createIndexes);
      createIndexes.should.be.a('function');
      should.exist(collections);
      collections.should.an('object');
      should.exist(collections.blockCollection);
      collections.blockCollection.should.be.a('string');
      should.exist(collections.eventCollection);
      collections.eventCollection.should.be.a('string');
      should.exist(collections.operationCollection);
      collections.operationCollection.should.be.a('string');
      await createIndexes([{
        collection: collections.operationCollection,
        fields: {'operation.record.type': 1},
        options: {unique: false, background: false, name: 'fooIndex'}
      }]);
    }
  }
});

describe.only('Storage Plugin API', () => {
  it('plugin adds an index to the operations collection', done => {
    const meta = {};
    const options = {
      ledgerId: exampleLedgerId, ledgerNodeId: exampleLedgerNodeId,
      services: ['foo']
    };
    async.auto({
      storage: callback => blsMongodb.add(meta, options, callback),
      test: ['storage', (results, callback) => {
        const {storage} = results;
        storage.operations.collection.indexInformation({}, (err, result) => {
          assertNoError(err);
          should.exist(result.fooIndex);
          callback();
        });
      }]
    }, err => {
      assertNoError(err);
      done();
    });
  });
});
