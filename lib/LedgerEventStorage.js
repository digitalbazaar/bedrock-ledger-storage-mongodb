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
    this.getActiveConfig = callbackify(this.getActiveConfig.bind(this));
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
   * Identify events that are not in storage.
   *
   * @param eventHash the hash or array of hashes to check.
   *
   * @return a Promise that resolves to the event hashes that are not in
   *   storage.
   */
  async difference(eventHash) {
    const hashes = [].concat(eventHash);
    const query = {
      'meta.deleted': {$exists: false},
      'meta.eventHash': {$in: hashes},
    };
    const records = await this.collection.find(
      query, {_id: 0, 'meta.eventHash': 1}).toArray();
    const localEvents = new Set(records.map(r => r.meta.eventHash));
    return hashes.filter(v => !localEvents.has(v));
  }

  // TODO: document that this returns a database cursor
  // return records in the same order as the request
  // FIXME: `event.operation` must be removed from merge events
  getMany({eventHashes}) {
    const operationCollectionName = this.operationStorage.collection.s.name;
    return this.collection.aggregate([
      {$match: {
        'meta.eventHash': {$in: eventHashes},
      }},
      {$lookup:
        {
          from: operationCollectionName,
          let: {eventHash: '$meta.eventHash'},
          pipeline: [
            {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
            {$sort: {'meta.eventOrder': 1}},
            {$replaceRoot: {newRoot: "$operation"}}
          ],
          as: 'event.operation'
        }
      },
      // FIXME: This looks like it would be VERY slow
      {$addFields: {_order: {$indexOfArray: [eventHashes, '$meta.eventHash']}}},
      {$sort: {'_order': 1}},
      {$project: {_id: 0, _order: 0}},
    ], {allowDiskUse: true});
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
    const query = {
      'meta.deleted': {$exists: false},
      'meta.eventHash': {$in: hashes},
    };
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
    const query = {
      'meta.eventHash': eventHash,
      'meta.deleted': {$exists: false}
    };
    const records = await this.collection.aggregate([
      {$match: query},
      {$limit: 1},
      {$lookup: {
        from: operationCollectionName,
        let: {eventHash: '$meta.eventHash'},
        pipeline: [
          {$match: {$expr: {$eq: ['$meta.eventHash', '$$eventHash']}}},
          {$sort: {'meta.eventOrder': 1}},
          {$replaceRoot: {newRoot: "$operation"}}
        ],
        as: 'event.operation'
      }},
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
    // TODO: figure out how to do this with the aggregate command
    if(event.type !== 'WebLedgerOperationEvent') {
      delete event.operation;
    }
    return {event, meta};
  }

  /**
   * Gets the active configuration based on blockHeight. A ledger configuration
   * is active for blocks that are *subsequent* to the block that includes
   * the ledger configuration event itself.
   *
   * @param blockHeight - the blockHeight used to locate the ledger
   *   configuration.
   *
   * @return a Promise that resolves to the result of the retrieval.
   *   event - the event.
   *   meta - metadata about the event.
   */
  async getActiveConfig({blockHeight}) {
    assert.optionalNumber(blockHeight, 'blockHeight');
    const query = {
      'event.type': 'WebLedgerConfigurationEvent',
      // NOTE: the active config does not include any configs that may be in
      // the block specified by blockHeight
      'meta.blockHeight': {$lt: blockHeight},
      'meta.deleted': {$exists: false},
    };
    const records = await this.collection.find(query).sort({
      'meta.blockHeight': -1,
      'meta.blockOrder': -1
    }).limit(1).toArray();
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
  async getCount({consensus, type}) {
    const query = {
      'meta.deleted': {
        $exists: false
      }
    };
    if(typeof consensus === 'boolean') {
      query['meta.consensus'] = {$exists: consensus};
    }
    if(type) {
      query['event.type'] = type;
    }
    return await this.collection.find(query).count();
  }

  /**
   * Gets the latest configuration event that has consensus.
   *
   * @return a Promise that resolves to a record with:
   *   event - the event.
   *   meta - metadata about the event.
   */
  async getLatestConfig() {
    // find the latest config event that has consensus
    const query = {
      'event.type': 'WebLedgerConfigurationEvent',
      'meta.deleted': {$exists: false},
    };
    const records = await this.collection.find(query).sort({
      'meta.blockHeight': -1,
      'meta.blockOrder': -1
    }).limit(1).toArray();
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
        for(const key in operation.changes) {
          const arrayUpdate = database.buildUpdate(operation.changes);
          const field = Object.keys(arrayUpdate)[0];
          if(field in pushFields) {
            pushFields[field].$each.push(arrayUpdate[field]);
          } else {
            pushFields[field] = {$each: [arrayUpdate[field]]};
          }
        }
      } else if(operation.op === 'remove') {
        for(const key in operation.changes) {
          const arrayUpdate = database.buildUpdate(operation.changes);
          const field = Object.keys(arrayUpdate)[0];
          if(field in pullFields) {
            pullFields[field].push(arrayUpdate[field]);
          } else {
            pullFields[field] = [arrayUpdate[field]];
          }
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
