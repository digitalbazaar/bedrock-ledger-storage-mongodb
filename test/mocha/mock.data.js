/*
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const helpers = require('./helpers');

const mock = {};
module.exports = mock;

const identities = mock.identities = {};
let userName;

// identity with permission to access its own agreements
userName = 'regularUser';
identities[userName] = {};
identities[userName].identity = helpers.createIdentity(userName);
// identities[userName].identity.sysResourceRole.push({
//   sysRole: 'bedrock-ledger.test',
//   generateResource: 'id'
// });

// // identity with no permissions
// userName = 'noPermission';
// identities[userName] = {};
// identities[userName].identity = helpers.createIdentity(userName);
const events = mock.events = {};
events.alpha = {
  id: 'https://example.com/events/123456',
  description: 'Example event',
  signature: {
    type: 'RsaSignature2017',
    created: '2017-05-10T19:47:13Z',
    creator: 'http://example.com/keys/123',
    signatureValue: 'gXI7wqa...FMMJoS2Bw=='
  }
};

events.config = {
  '@context': 'https://w3id.org/webledger/v1',
  type: 'WebLedgerConfigurationEvent',
  ledgerConfiguration: {
    type: 'WebLedgerConfiguration',
    ledger: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59',
    consensusMethod: {
      type: 'UnilateralConsensus2017'
    },
    eventGuard: [{
      type: 'ProofOfSignature2017',
      supportedEventType: 'WebLedgerEvent',
      approvedSigner: [
        'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
      ],
      minimumSignaturesRequired: 1
    }, {
      type: 'ProofOfSignature2017',
      supportedEventType: 'WebLedgerConfigurationEvent',
      approvedSigner: [
        'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
      ],
      minimumSignaturesRequired: 1
    }]
  },
  signature: {
    type: 'RsaSignature2017',
    created: '2017-10-24T05:33:31Z',
    creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
    domain: 'example.com',
    signatureValue: 'eyiOiJJ0eXAK...EjXkgFWFO'
  }
};

const configBlocks = mock.configBlocks = {};
configBlocks.alpha = {
  '@context': 'https://w3id.org/webledger/v1',
  id: '',
  type: 'WebLedgerEventBlock',
  event: [events.config]
};

const eventBlocks = mock.eventBlocks = {};
eventBlocks.alpha = {
  id: '',
  type: 'WebLedgerEventBlock',
  event: [{
    '@context': 'https://w3id.org/webledger/v1',
    id: '',
    type: 'WebLedgerEvent',
    operation: 'Create',
    input: [{
//      '@graph': {
        id: 'https://example.com/events/123456',
        description: 'Example event',
        signature: {
          type: 'RsaSignature2017',
          created: '2017-05-10T19:47:13Z',
          creator: 'http://example.com/keys/123',
          signatureValue: 'gXI7wqa...FMMJoS2Bw=='
//        }
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
