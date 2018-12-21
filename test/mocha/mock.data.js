/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const config = require('bedrock').config;
const helpers = require('./helpers');

const mock = {};
module.exports = mock;

const identities = mock.identities = {};

// identity with permission to access its own agreements
const userName = 'regularUser';
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
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'WebLedgerOperationEvent',
};

events.config = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'WebLedgerConfigurationEvent',
  ledgerConfiguration: {
    type: 'WebLedgerConfiguration',
    ledger: 'urn:uuid:651544dc-c029-420d-9d85-3cecad6fc5c5',
    consensusMethod: 'Continuity2017',
    ledgerConfigurationValidator: [],
    operationValidator: [{
      type: 'ExampleValidator2017',
      validatorFilter: [{
        type: 'ValidatorFilterByType',
        validatorFilterByType: [
          'CreateWebLedgerRecord',
          'UpdateWebLedgerRecord'
        ]
      }]
    }],
    proof: {
      type: 'RsaSignature2018',
      created: '2018-07-01T18:59:52Z',
      creator: 'did:v1:nym:z2DzQmYumekrfMLh...zSjN5vN8W8g3#authn-key-1',
      jws: 'eyJhbGciO...ltm5VrsXunx-A '
    },
    sequence: 0
  }
};

const configBlocks = mock.configBlocks = {};
configBlocks.alpha = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  id: '',
  type: 'WebLedgerEventBlock',
  event: [events.config]
};

const eventBlocks = mock.eventBlocks = {};
eventBlocks.alpha = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  id: '',
  type: 'WebLedgerEventBlock',
  blockHeight: 1,
  previousBlock: '',
  previousBlockHash: ''
};

const operations = mock.operations = {};
operations.alpha = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'CreateWebLedgerRecord',
  record: {
    '@context': config.constants.TEST_CONTEXT_V1_URL,
    // id: intentionally omitted
    type: 'Concert',
    name: 'Primary Event',
    startDate: '2017-07-14T21:30',
    location: 'https://example.org/the-venue-new-york',
    offers: {
      type: 'Offer',
      price: '13.00',
      priceCurrency: 'USD',
      url:
        `https://example.org/purchase/a05bebf8-c966-427f-92f2-ff9060f4bd23`,
    }
  },
  proof: {
    type: 'RsaSignature2018',
    created: '2017-05-10T19:47:13Z',
    creator: "https://bedrock.local:18443/consensus/continuity2017/voters/57565658-0d8a-4668-b734-e801aeaa6472#key",
    jws: "nlx8c9uFI8Ur/h57F5AeHHrKPSKiiGJmN6APRnYesQPK4LXftnm2lzqpWzsvKGDPzH6QfoOIktQu2Ax0pj/Bi6Oa4/Na75HuoRGppaHCqlyrgbr5EUPRCiYSjlsYKBhEN6ITdmR/O8iGz9WZi4PQjSW9XrrP8bQLeu9Kzsu5hdkzmgS4f3PCXpImwpKFttyF7xARvSQxrgRxZrqWPIGtD9sghRY2/Zn3T2npTaOTXMhgW9Lc7uEpjThnCEsrKflshbLGevZglc/njBp5SoEgon8CuzQIkMBFjCTEdJYBtTuk0AF5BcVyoxPDfH9bdUYOIMFaDhZBQKM5tQEU2GqE/g=="
  }
};

operations.beta = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'UpdateWebLedgerRecord',
  recordPatch: {
    target: `https://example.com/events/a05bebf8-c966-427f-92f2-ff9060f4bd23`,
    sequence: 0,
    patch: [{
      op: 'add', path: '/endDate', value: '2017-07-14T23:30'
    }]
  },
  proof: {
    type: 'RsaSignature2018',
    created: '2017-05-10T19:47:13Z',
    creator: "https://bedrock.local:18443/consensus/continuity2017/voters/57565658-0d8a-4668-b734-e801aeaa6472#key",
    jws: "nlx8c9uFI8Ur/h57F5AeHHrKPSKiiGJmN6APRnYesQPK4LXftnm2lzqpWzsvKGDPzH6QfoOIktQu2Ax0pj/Bi6Oa4/Na75HuoRGppaHCqlyrgbr5EUPRCiYSjlsYKBhEN6ITdmR/O8iGz9WZi4PQjSW9XrrP8bQLeu9Kzsu5hdkzmgS4f3PCXpImwpKFttyF7xARvSQxrgRxZrqWPIGtD9sghRY2/Zn3T2npTaOTXMhgW9Lc7uEpjThnCEsrKflshbLGevZglc/njBp5SoEgon8CuzQIkMBFjCTEdJYBtTuk0AF5BcVyoxPDfH9bdUYOIMFaDhZBQKM5tQEU2GqE/g=="
  }
};

operations.gamma = {
  '@context': config.constants.WEB_LEDGER_CONTEXT_V1_URL,
  type: 'CreateWebLedgerRecord',
  record: {
    '@context': config.constants.TEST_CONTEXT_V1_URL,
    // id: intentionally omitted
    type: 'Offer',
    name: 'Discount on Concert Tickets',
    price: '12.00',
    priceCurrency: 'USD',
    event: '',
  },
  proof: {
    type: 'RsaSignature2018',
    created: '2017-05-10T19:47:13Z',
    creator: "https://bedrock.local:18443/consensus/continuity2017/voters/57565658-0d8a-4668-b734-e801aeaa6472#key",
    jws: "nlx8c9uFI8Ur/h57F5AeHHrKPSKiiGJmN6APRnYesQPK4LXftnm2lzqpWzsvKGDPzH6QfoOIktQu2Ax0pj/Bi6Oa4/Na75HuoRGppaHCqlyrgbr5EUPRCiYSjlsYKBhEN6ITdmR/O8iGz9WZi4PQjSW9XrrP8bQLeu9Kzsu5hdkzmgS4f3PCXpImwpKFttyF7xARvSQxrgRxZrqWPIGtD9sghRY2/Zn3T2npTaOTXMhgW9Lc7uEpjThnCEsrKflshbLGevZglc/njBp5SoEgon8CuzQIkMBFjCTEdJYBtTuk0AF5BcVyoxPDfH9bdUYOIMFaDhZBQKM5tQEU2GqE/g=="
  }
};
