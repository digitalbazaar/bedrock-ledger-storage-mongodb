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
const configEventTemplate = mockData.events.config;
const configBlockTemplate = mockData.configBlocks.alpha;
const eventBlockTemplate = mockData.eventBlocks.alpha;

configBlockTemplate.id = exampleLedgerId + '/blocks/1';
configEventTemplate.ledger = exampleLedgerId;

describe('State Machine Storage API', () => {
  let ledgerStorage;
  let counter = 0;

  before(done => {
    const configEvent = _.cloneDeep(configEventTemplate);
    const configBlock = _.cloneDeep(configBlockTemplate);
    const meta = {};
    const options = {};

    async.auto({
      initStorage: callback => blsMongodb.add(
        configEvent, meta, options, (err, storage) => {
          ledgerStorage = storage;
          callback(err, storage);
        }),
      hashConfig: callback => helpers.testHasher(configBlock, callback),
      addConfigBlock: ['initStorage', 'hashConfig', (results, callback) => {
        // blockHash and consensus are normally created by consensus plugin
        configBlock.blockHeight = 0;
        meta.blockHash = results.hashConfig;
        meta.consensus = true;
        meta.consensusDate = new Date();
        ledgerStorage.blocks.add(configBlock, meta, {}, callback);
      }]
    }, done);
  });
  beforeEach(done => {
    // FIXME: Remove ledger
    done();
  });
  it('should get state machine object by id', done => {
    const eventBlock = _.cloneDeep(eventBlockTemplate);
    eventBlock.id = exampleLedgerId + '/blocks/2';
    eventBlock.event[0].id = exampleLedgerId + '/events/1';
    eventBlock.blockHeight = 1;
    const event = eventBlock.event[0];
    const meta = {
      consensus: true,
      consensusDate: Date.now()
    };
    const options = {};

    async.auto({
      hashEvent: callback => helpers.testHasher(event, callback),
      hashBlock: callback => helpers.testHasher(eventBlock, callback),
      addEvent: ['hashEvent', (results, callback) => {
        meta.eventHash = results.hashEvent;
        meta.consensus = true;
        meta.consensusDate = new Date();
        ledgerStorage.events.add(event, meta, options, callback);
      }],
      addBlock: ['hashBlock', (results, callback) => {
        meta.blockHash = results.hashBlock;
        meta.consensus = true;
        meta.consensusDate = new Date();
        ledgerStorage.blocks.add(eventBlock, meta, options, callback);
      }],
      get: ['addEvent', 'addBlock', (results, callback) => {
        const objId = eventBlock.event[0].input[0].id;
        ledgerStorage.stateMachine.get(objId, callback);
      }],
      getTwo: ['get', (results, callback) => {
        const objId = eventBlock.event[0].input[0].id;
        ledgerStorage.stateMachine.get(objId, callback);
      }],
      ensureObject: ['getTwo', (results, callback) => {
        const objId = eventBlock.event[0].input[0].id;
        const record = results.get;
        should.exist(record);
        should.exist(record.object);
        should.exist(record.object.id);
        should.exist(record.meta);
        should.exist(record.meta.blockHeight);
        record.object.id.should.equal(objId);
        results.getTwo.object.id.should.equal(objId);
        callback(0);
      }]}, err => done(err));
  });
  it.skip('should get updated state machine object', done => {

  });
});
