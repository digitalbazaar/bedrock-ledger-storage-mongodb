/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */

const config = require('bedrock').config;
const fs = require('fs');
const path = require('path');
require('bedrock-permission');

const permissions = config.permission.permissions;
const roles = config.permission.roles;

config.mocha.tests.push(path.join(__dirname, 'mocha'));

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

// ledger constants
var constants = config.constants;
// Web Ledger JSON-LD context URL and local copy
constants.WEB_LEDGER_CONTEXT_V1_URL = 'https://w3id.org/webledger/v1';
constants.CONTEXTS[constants.WEB_LEDGER_CONTEXT_V1_URL] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './contexts/webledger-v1.jsonld'),
    {encoding: 'utf8'}));
constants.TEST_CONTEXT_V1_URL = 'https://w3id.org/test/v1';
constants.CONTEXTS[constants.TEST_CONTEXT_V1_URL] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './contexts/test-v1.jsonld'),
    {encoding: 'utf8'}));
constants.SECURITY_CONTEXT_V1_URL = 'https://w3id.org/security/v1';
constants.CONTEXTS[constants.SECURITY_CONTEXT_V1_URL] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './contexts/security-v1.jsonld'),
    {encoding: 'utf8'}));
constants.IDENTITY_CONTEXT_V1_URL = 'https://w3id.org/identity/v1';
constants.CONTEXTS[constants.IDENTITY_CONTEXT_V1_URL] = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, './contexts/identity-v1.jsonld'),
    {encoding: 'utf8'}));
