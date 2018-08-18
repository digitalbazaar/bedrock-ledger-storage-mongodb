/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

module.exports = {
  type: 'ledgerStoragePlugin',
  api: {
    expandIndexes: async ({createIndexes, collections}) => {
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
      return createIndexes([{
        collection: collections.operationCollection,
        fields: {'operation.record.type': 1},
        options: {unique: false, background: false, name: 'mockIndex'}
      }]);
    },
    storage: {
      operations: {
        // NOTE: do not use arrow functions here because this function is to be
        // bound to the class instance. Methods should be properly namespaced
        // to avoid conflicts.
        mockQuery: async function({maxBlockHeight, query}) {
          const {
            eventCollection, collection: operationCollection,
            util: {assert, dbHash, BedrockError}
          } = this;

          assert.number(maxBlockHeight, 'maxBlockHeight');
          assert.object(query, 'query');

          const eventQuery = {
            'event.type': 'WebLedgerOperationEvent',
            'meta.blockHeight': {$lte: maxBlockHeight},
            'meta.consensus': {$exists: true},
          };
          const operationMatch = {
            $and: [
              {$in: ['$meta.eventHash', '$$eventHashes']}
            ]
          };
          Object.keys(query).forEach(k => {
            if(Array.isArray(query[k])) {
              operationMatch.$and.push(
                {$in: [`$operation.record.${k}`, query[k]]});
            } else if(k === 'id') {
              operationMatch.$and.push(
                {$eq: ['$recordId', dbHash(query[k])]});
            } else {
              operationMatch.$and.push(
                {$eq: [`$operation.record.${k}`, query[k]]});
            }
          });
          let result;
          try {
            result = await eventCollection.aggregate([
              {$match: eventQuery},
              {$project: {_id: 0, 'meta.eventHash': 1}},
              {$group: {
                _id: null,
                eventHashes: {$addToSet: '$meta.eventHash'}
              }},
              {$lookup: {
                from: operationCollection.s.name,
                let: {eventHashes: '$eventHashes'},
                pipeline: [
                  {$match: {$expr: operationMatch}},
                  {$project: {_id: 0, 'operation.record.id': 1}},
                  {$group: {_id: null, records: {
                    $addToSet: '$operation.record.id'
                  }}},
                  {$project: {_id: 0}},
                ],
                as: 'records',
              }},
              {$project: {records: {$arrayElemAt: ['$records', 0]}}},
              {$replaceRoot: {newRoot: '$records'}}
            ]).toArray();
          } catch(err) {
            if(err.code === 40228) {
              throw new BedrockError(
                'Not Found.', 'NotFoundError',
                {httpStatusCode: 404, public: true});
            }
            throw err;
          }
          if(result.length === 0) {
            throw new BedrockError(
              'Not Found.', 'NotFoundError',
              {httpStatusCode: 404, public: true});
          }
          return result[0];
        }
      }
    }
  }
};
