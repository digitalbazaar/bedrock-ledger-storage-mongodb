/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */

const config = require('bedrock').config;
const path = require('path');
require('bedrock-permission');

const roles = config.permission.roles;

config.mocha.tests.push(path.join(__dirname, 'mocha'));
config.mocha.options.timeout = 60000;

// MongoDB
config.mongodb.name = 'bedrock_ledger_storage_mongodb_test';
config.mongodb.dropCollections.onInit = true;
config.mongodb.dropCollections.collections = [];

roles['bedrock-ledger-storage-mongodb.test'] = {
  id: 'bedrock-ledger-storage-mongodb.test',
  label: 'Test Role',
  comment: 'Role for Test User',
  sysPermission: [
  ]
};
