/*!
 * LedgerStorage enables the storage and retrieval of ledger
 * blocks, events and operations.
 *
 * Copyright (c) 2016-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const database = require('bedrock-mongodb');
const LedgerBlockStorage = require('./LedgerBlockStorage');
const LedgerEventStorage = require('./LedgerEventStorage');
const LedgerOperationStorage = require('./LedgerOperationStorage');

module.exports = class LedgerStorage {
  constructor(options) {
    this.id = options.storageId;
    this.operations = new LedgerOperationStorage(options);
    options.operationStorage = this.operations;
    this.events = new LedgerEventStorage(options);
    options.eventStorage = this.events;
    this.blocks = new LedgerBlockStorage(options);
    options.blockStorage = this.blocks;
    this.driver = database;
  }
};
