/*!
 * Ledger event storage class.
 *
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const _ = require('lodash');
const assert = require('assert-plus');
const bedrock = require('bedrock');
const database = require('bedrock-mongodb');
const jsonld = bedrock.jsonld;
const logger = require('./logger');
const {callbackify, BedrockError} = bedrock.util;

// this projection stage is used in multiple aggregate queries, it is used
// to conditionally remove `event.operation` from `event` objects
const aggregateStageEventProjection = {
  $project: {
    _id: 0,
    meta: 1,
    'event.@context': 1,
    'event.basisBlockHeight': 1,
    'event.ledgerConfiguration': 1,
    'event.parentHash': 1,
    'event.proof': 1,
    'event.treeHash': 1,
    'event.type': 1,
    'event.operation': {
      $cond: {
        if: {$ne: ['WebLedgerOperationEvent', '$event.type']},
        then: '$$REMOVE',
        else: '$event.operation'
      }
    }
  }
};

// TODO: ideally, code to create indexes for event storage would be in
// this file

/**
 * The events API is used to perform operations on events associated
 * with a particular ledger.
 * @memberof module:bedrock-ledger-storage-mongodb
 */
class LedgerEventStorage {
  constructor({eventCollection, ledgerNodeId, operationStorage}) {
    // assign the collection used for event storage
    this.collection = eventCollection;
    this.operationStorage = operationStorage;
    this.ledgerNodeId = ledgerNodeId;
    this.plugins = {};
    // expose utils that can be used in storage plugins
    this.util = {
      assert,
      dbHash: database.hash,
      logger,
      BedrockError,
    };

    // FIXME: temporary backwards compatible callback support
    this.add = callbackify(this.add.bind(this));
    this.addMany = callbackify(this.addMany.bind(this));
    this.difference = callbackify(this.difference.bind(this));
    this.exists = callbackify(this.exists.bind(this));
    this.get = callbackify(this.get.bind(this));
    this.getEffectiveConfig = callbackify(this.getEffectiveConfig.bind(this));
    this.getCount = callbackify(this.getCount.bind(this));
    this.getLatestConfig = callbackify(this.getLatestConfig.bind(this));
    this.update = callbackify(this.update.bind(this));
    this.remove = callbackify(this.remove.bind(this));
  }

  /**
   * Adds an event to associate with a ledger given an event and a set of
   * options.
   *
   * @param event - the event to associate with a ledger.
   * @param meta - the metadata that is associated with the event.
   *
   * @return the result of the operation:
   *   event - the event that was committed to storage.
   *   meta - the metadata that was committed to storage.
   */
  async add({event, meta}) {
    if(!(event && _.isObject(event))) {
      throw new TypeError('`event` must be an object.');
    }
    if(!(meta && meta.eventHash)) {
      throw new TypeError('`meta.eventHash` is required.');
    }
    const {operationHash} = event;
    // drop `operationHash` from the event without mutating or cloning
    const _event = _.pickBy(event, (v, k) => k !== 'operationHash');
    // insert the event
    const now = Date.now();
    const record = {
      event: _event,
      meta: _.defaults(meta, {
        created: now,
        updated: now
      })
    };

    logger.verbose(`adding event: ${meta.eventHash}`);

    if(!operationHash && jsonld.hasValue(
      event, 'type', 'WebLedgerOperationEvent')) {
      throw new BedrockError(
        '`operationHash` is required for event type ' +
        '`WebLedgerOperationEvent`', 'DataError', {event});
    }

    // some types of events do not include operationHash, for those that do,
    // ensure the operation(s) exist before storing the event
    if(operationHash) {
      const {eventHash} = meta;
      const exists = await this.operationStorage.exists(
        {eventHash, operationHash});
      // failure
      if(!exists) {
        throw new BedrockError(
          'Some operations have not been properly assigned to the event.',
          'InvalidStateError', {eventRecord: record, operationHash});
      }
    }

    try {
      const {event, meta} = (await this.collection.insert(
        record, database.writeOptions)).ops[0];
      return {event, meta};
    } catch(e) {
      if(database.isDuplicateError(e)) {
        throw new BedrockError(
          'An event with the same hash already exists.',
          'DuplicateError', {
            httpStatusCode: 409,
            public: true,
            eventHash: meta.eventHash
          }, e.message);
      }
      throw e;
    }
  }

  // TODO: add docs
  async addMany({events}) {
    const dupHashes = [];
    // retry indefinitely on duplicate errors (duplicates will be removed
    // from the `event` array so the rest of the events can be inserted)
    while(events.length > 0) {
      try {
        await this.collection.insertMany(events, {ordered: true});
        events = [];
      } catch(e) {
        if(!database.isDuplicateError(e)) {
          throw e;
        }
        // remove events up to the dup and retry
        dupHashes.push(events[e.index].meta.eventHash);
        events = events.slice(e.index + 1);
      }
    }
    return {dupHashes};
  }

  /**
   * Filter a list of eventHashes. The `blockHeight` and `consensus` parameters
   * are mutually exclusive.
   *
   * @param {(string|string[])} eventHash -  eventHash(es) to filter.
   * @param {integer} [blockHeight] - filter on `meta.blockHeight`.
   * @param {boolean} [consensus] - filter on `meta.consensus`.
   *
   * @returns {Promise} The eventHashes that satisfy the filter.
   */
  async filterHashes({blockHeight, consensus, eventHash}) {
    // only blockHeight OR consensus filter is allowed
    // this is because a combined query cannot be covered under an index
    // see audit below for details
    assert.optionalNumber(blockHeight, 'blockHeight');
    assert.optionalBool(consensus, 'consensus');
    const hashes = [].concat(eventHash);
    // audit:storage-mongodb/05cb765a-bc0f-4b5d-a1d4-4fe761e57154.md
    const query = {'meta.eventHash': {$in: hashes}};
    if(_.isNumber(blockHeight) && _.isUndefined(consensus)) {
      query['meta.blockHeight'] = blockHeight;
    } else if(_.isBoolean(consensus) && _.isUndefined(blockHeight)) {
      query['meta.consensus'] = consensus;
    } else {
      throw new TypeError(
        'Only one of `blockHeight` or `consensus` may be submitted.');
    }
    const projection = {_id: 0, 'meta.eventHash': 1};
    const records = await this.collection.find(query, projection).toArray();
    return records.map(r => r.meta.eventHash);
  }

  /**
   * Identify events that are not in storage.
   *
   * @param eventHash the hash or array of hashes to check.
   *
   * @return a Promise that resolves to the event hashes that are not in
   *   storage.
   */
  async difference(eventHash) {
    const hashes = [].concat(eventHash);
    // audit:storage-mongodb/38528b46-bc62-4359-a3a3-c5022e5f01b9.md
    const query = {'meta.eventHash': {$in: hashes}};
    const projection = {_id: 0, 'meta.eventHash': 1};
    const records = await this.collection.find(query, projection).toArray();
    const localEvents = new Set(records.map(r => r.meta.eventHash));
    return hashes.filter(v => !localEvents.has(v));
  }

  /**
   * Determine if an event exists matching the parameters. The `blockHeight`
   * and `eventHashes` parameters are mutually exclusive.
   *
   * @param {integer} [blockHeight] - filter on `meta.blockHeight`.
   * @param {string[]} [eventHashes] - filter on `meta.eventHash`.
   *
   * @returns {Promise<cursor>} matching events.
   */
  getMany({blockHeight, eventHashes}) {
    const operationCollectionName = this.operationStorage.collection.s.name;
    const lookupStage = {
      $lookup: {
        from: operationCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
          {$sort: {'meta.eventOrder': 1}},
          {$replaceRoot: {newRoot: '$operation'}}
        ],
        as: 'event.operation'
      }
    };
    if(_.isNumber(blockHeight) && !eventHashes) {
      return this.collection.aggregate([
        {$match: {'meta.blockHeight': blockHeight}},
        lookupStage,
        {$sort: {'meta.blockHeight': 1, 'meta.blockOrder': 1}},
        aggregateStageEventProjection
      ], {allowDiskUse: true});
    }
    if(eventHashes && !_.isNumber(blockHeight)) {
      return this.collection.aggregate([
        {$match: {'meta.eventHash': {$in: eventHashes}}},
        lookupStage,
        // FIXME: This looks like it would be VERY slow
        {$addFields: {
          _order: {$indexOfArray: [eventHashes, '$meta.eventHash']}
        }},
        {$sort: {'_order': 1}},
        aggregateStageEventProjection
      ], {allowDiskUse: true});
    }
    throw new TypeError(
      'One of `blockHeight` or `eventHashes` must be specified.');
  }

  /**
   * Determine if an event exists matching the parameters.
   *
   * @param {integer} blockHeight - filter on `meta.blockHeight`.
   * @param {string} type - event type (e.g. WebLedgerConfigurationEvent).
   *
   * @returns {Promise<boolean>} matching events exist.
   */
  async hasEvent({blockHeight, explain = false, type}) {
    assert.number(blockHeight, 'blockHeight');
    assert.string(type, 'type');
    const query = {
      'meta.blockHeight': blockHeight,
      // `meta.consensus` must be included to utilize the proper index
      'meta.consensus': true,
      'event.type': type
    };
    const projection = {_id: 0, 'meta.consensus': 1};
    const cursor = await this.collection.find(query, projection)
      .limit(1)
      .hint('event.consensus.core.1');
    if(explain) {
      return cursor.explain('executionStats');
    }
    return cursor.hasNext();
  }

  /**
   * Determine if an event with a given hash exists.
   *
   * @param eventHash the hash or array of hashes of the event(s).
   *
   * @return a Promise that resolves to `true` if all the event hashes exist,
   *   and `false` if not.
   */
  async exists(eventHash) {
    const hashes = [].concat(eventHash);
    // audit:storage-mongodb/e75847d0-da31-4e47-9f57-bac211c12e9c.md
    const query = {'meta.eventHash': {$in: hashes}};
    const count = await this.collection.find(query).count();
    return count === hashes.length;
  }

  /**
   * Gets an event in the ledger given a query and a set of options.
   *
   * @param eventHash - the hash of the event to fetch from storage.
   *
   * @return a Promise that resolves to record with:
   *   event - the event.
   *   meta - metadata about the event.
   */
  async get(eventHash) {
    const operationCollectionName = this.operationStorage.collection.s.name;
    const query = {'meta.eventHash': eventHash};
    const records = await this.collection.aggregate([
      {$match: query},
      {$limit: 1},
      {$lookup: {
        from: operationCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
          {$sort: {'meta.eventOrder': 1}},
          {$replaceRoot: {newRoot: '$operation'}}
        ],
        as: 'event.operation'
      }},
      aggregateStageEventProjection
    ], {allowDiskUse: true}).toArray();
    if(records.length === 0) {
      throw new BedrockError(
        'Failed to get event. An event with the given ID does not exist.',
        'NotFoundError', {
          httpStatusCode: 404,
          public: true,
          eventHash
        });
    }
    const {event, meta} = records[0];
    return {event, meta};
  }

  /**
   * Gets the effective configuration based on blockHeight. A ledger
   * configuration is effective for blocks that are *subsequent* to the block
   * that includes the ledger configuration event itself.
   *
   * @param {integer} blockHeight - the blockHeight used to locate the ledger
   *   configuration.
   * @param {boolean} [explain] return statistics for query profiling.
   *
   * @return {Promise<object>} record with:
   *   event - the event.
   *   meta - metadata about the event.
   */
  async getEffectiveConfig({blockHeight, explain = false}) {
    assert.optionalNumber(blockHeight, 'blockHeight');
    const query = {
      // NOTE: the active config does not include any configs that may be in
      // the block specified by blockHeight
      'meta.blockHeight': {$lt: blockHeight},
      'meta.effectiveConfiguration': true,
    };
    const projection = {_id: 0};
    const cursor = await this.collection.find(query, projection)
      .sort({'meta.blockHeight': -1})
      .hint('event.effectiveConfiguration.core.1')
      .limit(1);
    if(explain) {
      return await cursor.explain('executionStats');
    }
    const records = await cursor.toArray();
    if(records.length === 0) {
      throw new BedrockError(
        'The active ledger configuration was not found.',
        'NotFoundError', {blockHeight, httpStatusCode: 404, public: true});
    }
    return records[0];
  }

  /**
   * Gets a count of events.
   *
   * @param consensus - filter events based on consensus status.
   * @param type - filter events based on event type.
   *
   * @return a Promise that resolves to the number of events in storage.
   */
  // consensus === undefined means ignore consensus
  async getCount({consensus, type} = {}) {
    // audit:storage-mongodb/be42c50e-2399-4ded-a45a-5e8425a53b60.md
    const query = {};
    if(typeof consensus === 'boolean') {
      query['meta.consensus'] = consensus;
    }
    if(type) {
      query['event.type'] = type;
    }
    return await this.collection.find(query).count();
  }

  /**
   * Gets the latest configuration event that has consensus.
   *
   * @param {boolean} [explain] return statistics for query profiling.
   *
   * @return {Promise<object>} record with:
   *   event - the event.
   *   meta - metadata about the event.
   */
  async getLatestConfig({explain = false} = {}) {
    const query = {'meta.effectiveConfiguration': true};
    const projection = {_id: 0};
    const cursor = await this.collection.find(query, projection)
      .sort({'meta.blockHeight': -1})
      .hint('event.effectiveConfiguration.core.1')
      .limit(1);
    if(explain) {
      return await cursor.explain('executionStats');
    }
    const records = await cursor.toArray();
    if(records.length === 0) {
      throw new BedrockError(
        'The latest ledger configuration was not found.',
        'NotFoundError', {httpStatusCode: 404, public: true});
    }
    return records[0];
  }

  /**
   * Update an existing event associated with the ledger given an
   * eventId, an array of patch instructions, and a set of options.
   *
   * @param eventHash - the ID of the event to update
   * @param patch - a list of patch commands for the event
   */
  async update({eventHash, patch}) {
    if(!Array.isArray(patch)) {
      throw new TypeError('patch must be an array');
    }

    const setObject = {};
    const unsetObject = {};
    const pushFields = {};
    const pullFields = {};

    for(const operation of patch) {
      // ensure that only meta fields are modified
      const opLength = Object.keys(operation.changes).length;
      if(opLength !== 1 ||
        (opLength === 1 && operation.changes.meta === undefined)) {
        throw new BedrockError(
          'Only event meta can be updated.',
          'NotAllowedError', {operation});
      }

      // process set, unset, add, and remove operations
      if(operation.op === 'set') {
        _.extend(setObject, operation.changes);
      }
      else if(operation.op === 'unset') {
        _.extend(unsetObject, operation.changes);
      }
      else if(operation.op === 'add') {
        const arrayUpdate = database.buildUpdate(operation.changes);
        const field = Object.keys(arrayUpdate)[0];
        if(field in pushFields) {
          pushFields[field].$each.push(arrayUpdate[field]);
        } else {
          pushFields[field] = {$each: [arrayUpdate[field]]};
        }
      } else if(operation.op === 'remove') {
        const arrayUpdate = database.buildUpdate(operation.changes);
        const field = Object.keys(arrayUpdate)[0];
        if(field in pullFields) {
          pullFields[field].push(arrayUpdate[field]);
        } else {
          pullFields[field] = [arrayUpdate[field]];
        }
      }
    }

    // build the update object for MongoDB
    const update = {};
    const setFields = database.buildUpdate(setObject);
    const unsetFields = database.buildUpdate(unsetObject);

    if(Object.keys(setFields).length > 0) {
      update.$set = setFields;
    }
    if(Object.keys(unsetFields).length > 0) {
      update.$unset = unsetFields;
    }
    if(Object.keys(pushFields).length > 0) {
      update.$addToSet = pushFields;
    }
    if(Object.keys(pullFields).length > 0) {
      update.$pullAll = pullFields;
    }

    const result = await this.collection.update(
      {'meta.eventHash': eventHash}, update, database.writeOptions);
    if(result.result.n === 0) {
      throw new BedrockError(
        'Could not update event. Event with given hash not found.',
        'NotFoundError', {eventHash});
    }
  }

  /**
   * Delete an event associated with the ledger given an event hash.
   *
   * @param eventHash - the hash of the event to delete.
   */
  async remove(eventHash) {
    // find and delete the existing event
    const filter = {
      'meta.eventHash': eventHash
    };
    const now = Date.now();
    const update = {
      $set: {
        meta: {
          updated: now,
          deleted: now
        }
      }
    };
    const result = await this.collection.updateOne(filter, update);
    if(result.matchedCount !== 1) {
      throw new BedrockError(
        'Remove event failed; event not found.',
        'NotFoundError', {eventHash});
    }
  }
}

module.exports = LedgerEventStorage;
