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

const ledgers = mock.ledgers = {};

// constants
const GENESIS_HASH =
  'urn:sha256:0000000000000000000000000000000000000000000000000000000000000000';
mock.authorizedSignerUrl = 'https://example.com' + '/keys/authorized-key-1';

ledgers.alpha = {
  config: {
    '@context': 'https://w3id.org/webledger/v1',
    id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3/events/1',
    type: 'LedgerConfigurationEvent',
    ledgerConfig: {
      id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3',
      type: 'LedgerConfiguration',
      name: 'testLedger',
      description: 'A test Verifiable Claims ledger',
      storageMechanism: 'SequentialList',
      consensusAlgorithm: {
        type: 'ProofOfSignature2016',
        approvedSigner: [mock.authorizedSignerUrl],
        minimumSignaturesRequired: 1
      }
    },
    previousEvent: {
      hash: GENESIS_HASH
    }
  },
  events: [{
    '@context': [
      'https://w3id.org/webledger/v1',
      'https://w3id.org/test/v1'
    ],
    id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3/events/2',
    type: 'LedgerStorageEvent',
    replacesObject: [{
      id: 'https://example.us.gov/credentials/234234542',
      type: ['Credential', 'EmergencyResponseCredential'],
      claim: {
        id: 'did:370d4e2c-8839-4588-9ff7-2fda89da341f',
        emsLicense: {
          id: 'ems:FF-37-48573',
          status: 'valid'
        }
      }
    }],
    previousEvent: {
      id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3/events/1',
      // FIXME: should the hash be included here?
      hash: 'urn:sha256:'
    }
  }, {
    '@context': [
      'https://w3id.org/webledger/v1',
      'https://w3id.org/test/v1'
    ],
    id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3/events/3',
    type: 'LedgerStorageEvent',
    replacesObject: [{
      id: 'https://example.us.gov/credentials/234234542',
      type: ['Credential', 'EmergencyResponseCredential'],
      claim: {
        id: 'did:370d4e2c-8839-4588-9ff7-2fda89da341f',
        emsLicense: {
          id: 'ems:FF-37-48573',
          status: 'revoked'
        }
      }
    }],
    previousEvent: {
      id: 'did:c02915fc-672d-4568-8e6e-b12a0b35cbb3/events/2',
      // FIXME: should the hash be included here?
      hash: 'urn:sha256:'
    }
  }]
};

// all mock keys for all groups
mock.groups = {
  'authorized': {
    publicKey: '-----BEGIN PUBLIC KEY-----\n' +
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAskcRISeoOvgQM8KxMEzP\n' +
      'DMSfcw9NKJRvXNoFnxS0j7DcTPvi0zMXKAY5smANZ1iz9jQ43X/EUDNyjaWkiDUr\n' +
      'lpxGxTFq9D+hUnfzPCW6xAprzZaYhvuHun88CmULWeyWLphISk3/3YhRGnywyUfK\n' +
      'AuYYnKo6F+lDPNyPhknlB2uLblE4upqY5OrvlBdey6PV8teyjVSFo+WSTqzH02ne\n' +
      'X0aaIzZ675BWZyBGK5wCq/6vgCOSBqePflPXY2CfwdMVRe4I3FRnqEsKVQtZ2zwi\n' +
      '5j8YSZKNH4+2SrwuGqG/XcZaKCgKNMNDLRErZkdSPGCLM+OoPUOJEKdCvV3zUZYC\n' +
      'mwIDAQAB\n' +
      '-----END PUBLIC KEY-----',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\n' +
      'MIIEpQIBAAKCAQEAskcRISeoOvgQM8KxMEzPDMSfcw9NKJRvXNoFnxS0j7DcTPvi\n' +
      '0zMXKAY5smANZ1iz9jQ43X/EUDNyjaWkiDUrlpxGxTFq9D+hUnfzPCW6xAprzZaY\n' +
      'hvuHun88CmULWeyWLphISk3/3YhRGnywyUfKAuYYnKo6F+lDPNyPhknlB2uLblE4\n' +
      'upqY5OrvlBdey6PV8teyjVSFo+WSTqzH02neX0aaIzZ675BWZyBGK5wCq/6vgCOS\n' +
      'BqePflPXY2CfwdMVRe4I3FRnqEsKVQtZ2zwi5j8YSZKNH4+2SrwuGqG/XcZaKCgK\n' +
      'NMNDLRErZkdSPGCLM+OoPUOJEKdCvV3zUZYCmwIDAQABAoIBAQCMdIMhXO4kr2WM\n' +
      'chpJVGpXw91fuDFxBCkMvVRqddSf1JZsLJMTFBBtXyI7z4Mf5fm6wn/+une/PBlH\n' +
      'UbZj/Yf+29bB62I5VpxRreE7hPo1E4TFb51x01+m5jE2e09LJKNZyG5D5FnufkRv\n' +
      'msdpfR7B0+iWHWMxjXyEybxl73f6tEZcsfK/O46rtVsD/e8szyugg6zrrYWX8BA4\n' +
      'sIRHzLvOZIow5eNbkAFfxXbIRLxjxFt2zSFM3a0GjKkU/7Jb8XoNszHc0eFVS79y\n' +
      'PwQDeoqUP7sHLoHqazhFxI1KJftA/9NE6Nw+U/XJvQRyEaJxAGYgXvvRXhVtEN/H\n' +
      '0y4/tbJZAoGBANvph6zmm49ExBXIg5K6JZw/9vM5GdJpmOTglQuLZGYJ9zwcAiqq\n' +
      'U0mVGsJW0uq5VrHyqknc+edBfYD9K76mf0Sn9jG6rLL1fCl8BnLaF21tGVHU2W+Y\n' +
      'ogcYXRkgYgYVl6RhvRqEsMWSEdr0S0z240bOsUB5W1mA601q7PwXfWYPAoGBAM+I\n' +
      'eXxuskg+pCrWjgPke2Rk7PeEXrWPilSMR1ueA5kNCNdAMmxbDqDD7TKmKsyIfEEQ\n' +
      '3VcWLGVY4vj0yW+ptsw+QFlt8PSjCT2z1heJW9AFEA/9ULU0ZpVdgy+ys9/cXSfq\n' +
      'hZC4UQVwL3ODZE+hIU8pEJw1wTEMUvUBlxkOb4a1AoGBAI/6ydWt9lNK1obcjShX\n' +
      'r6ApUOnVjM5yTKQtVegFD2qvQ6ubOt/sPDOE58wtRFJhnh1Ln6pUf1mlSyJUn3tn\n' +
      'TxQIU+wjKEbS6sPOa/puR8BhGZ62GNYzvIGgtfNpfEQ3ht0dEM536bSw+fe80kBF\n' +
      'tG/7i5mG2wQyn9xEEXzLdFKJAoGAQA7rGNp+U0hqmgJyAYeUAtAYSOpl5XryAtjt\n' +
      '6byjdamNUguxxLpykHMJkzmxOkLiv566A3iHqZy/KoM8bigfkXmhmTkTSB/O6WnK\n' +
      'KqeuXE5Dv/u73sLW60HbDW0GkpHNe1Wrdpk+AQS40Nn8q4ub4XhWdTEuebpJHPEp\n' +
      't4U6LYUCgYEAvi38SUMij1zrNMVoslx5VojF961KCY+RNJvv9HmwV/W2XwjF0VGX\n' +
      'luDSMT5bBXHf1kQfB+DJGo2M6it2IOEZQjd9AJdW1baLGwm56AyQNko7HtEczH0n\n' +
      '42EADs/ajTEckTxULdirbEk2rINRwQC5kWMde3fcwAnn6xt3wvOyuwg=\n' +
      '-----END RSA PRIVATE KEY-----'
  },
  'unauthorized': { // unauthorized group
    publicKey: '-----BEGIN PUBLIC KEY-----\n' +
      'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlretzNDRSy2Dmr8xywmP\n' +
      '5BCE8LnFhfl7QB+7gsZSVANeoASk7l++JXM0nv/PJMuq9R8arekQ2tEGA53w1TU8\n' +
      'AbgaK1KYHngIU1X6EK9shPEjuy0pZu+63opkkaCD3euCCraogEk8Vhtx6VbCi04g\n' +
      'SGErFpWW6HRO5S3skw8p8+5iV4hZSR2QT/IW65yjBN22MGvOnLCEUEA+MMsbREdL\n' +
      'PwHtSFanDKseejdzTrBguHh6G4BBSswuB/isWYuKM/9/yHB+mNKwuksEcfT4uJjj\n' +
      'aN5LeRfeGrf6mSQ0KT/y/yIExtrLat9apG5EJbSw86++WXyjhR+Bl4wQNcCNYRHC\n' +
      'HwIDAQAB\n' +
      '-----END PUBLIC KEY-----',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\n' +
      'MIIEpAIBAAKCAQEAlretzNDRSy2Dmr8xywmP5BCE8LnFhfl7QB+7gsZSVANeoASk\n' +
      '7l++JXM0nv/PJMuq9R8arekQ2tEGA53w1TU8AbgaK1KYHngIU1X6EK9shPEjuy0p\n' +
      'Zu+63opkkaCD3euCCraogEk8Vhtx6VbCi04gSGErFpWW6HRO5S3skw8p8+5iV4hZ\n' +
      'SR2QT/IW65yjBN22MGvOnLCEUEA+MMsbREdLPwHtSFanDKseejdzTrBguHh6G4BB\n' +
      'SswuB/isWYuKM/9/yHB+mNKwuksEcfT4uJjjaN5LeRfeGrf6mSQ0KT/y/yIExtrL\n' +
      'at9apG5EJbSw86++WXyjhR+Bl4wQNcCNYRHCHwIDAQABAoIBAQCL53byz8foFBi8\n' +
      '9cvf4EFsgBUXbCq5oYtSS+KAk13q1LHqskTzbXaRRu7KxUTgsBpCrZvTYayeojcF\n' +
      '9n+POno4UlAgdOv2JI/946pcAKsogLsdTd/HyLLbTvXp5Glj//BXx5SEePcEKzfD\n' +
      'VSEDtQLsjR41Oai6oPR3cvjOzd2wquAT3+/KsPjhOR/dcBF0+vf7zsr+HjUhWyJB\n' +
      '6aEjAXLQzXnbqrJIQvx5Md9dm8vf8k+/QQ9uMCWbzAZHwzkEbPOQyYvQuN2EDFr0\n' +
      'jVgRUF/HUth/iweAm46iiHukPEAwfF9Qhryr9Fyoch9Y9XFYyfRtHAGI3SBR85C1\n' +
      'u0kY6QaZAoGBAOVuctsE0Qa3ZGP7GKGwYJLYTPy5o0YqQt3ynsfe5/MZXRzjcpC7\n' +
      'sCntTXQimU9iVyNHHvZ9hxgO4pYsBc81e5ciSbios1N/DjmHjj0/N6vZbl4+5+Ws\n' +
      'hzHkqCKJNkfx0gd/O11//6aPXIMbCj7lUnvUSyxWRARY0MAlfpDTacvlAoGBAKgr\n' +
      'vG4b9x1iOhRSMtoz7/Xly6oUIUfcz0lFR/bh4jEdpsFiGUG8WEADe/2IgxM5BrUW\n' +
      'uLvUmROEBLPfijaHXf1WUJll9Y0suFWKFKvzrqZj8Z8Fso5d4CBSUlt9vf8K634F\n' +
      '3vVRl/CopO7xfVZrpwkRGBI23vxDGrl5qqSOjl2zAoGBANcFrXUgzXn69IZTdSFM\n' +
      'OSZGu9h7bs86mlKCqVbuzPnjwoVpkRyeGpsgwN9f8ckZhEsWw6kFuk/M24UcmxE4\n' +
      'sazSQL9ktDRDtqQqLB+wmM9hRvPjBtkU2dvjzcQYTpwcwdeu4Ydeh82lPHHPLMoH\n' +
      'iEdvjkhuTO66AmKigTzgNp4VAoGALDSK7HqnY27ti2fr/BWI7x8/gO6XrPcq+byf\n' +
      'ZRMNTRHZQp4Ru4jRvcnsrsFSixwDWlilqKICtvGN9uY8w4ajuzMULq5xdHGb5shM\n' +
      'FMMSVqSQ39c0j123y2c4RNpxtffd3RuX9u5CvTznVfPemXfkyWpX5HnN9YuCG90S\n' +
      'cP0UCScCgYBXe5AL2398R+/1blgm2cycJvYEmvJb0MtS6ikOd0M5Nci/uOUBCt/1\n' +
      'AIVgd0FgUA4zaQowuAhnMqennYYsvh+rUz7GNpcQQIhGWkmnPTsB6XU70zxnQ7yP\n' +
      'VucJRhKAJ3S9G4KDkhxBO0S3guEQFiDaalh39m+UwUDPsdrmioqaoQ==\n' +
      '-----END RSA PRIVATE KEY-----'
  }
};

mock.ldDocuments = {
  "https://example.com/i/alpha": {
    "@context": "https://w3id.org/identity/v1",
    "id": "https://example.com/i/alpha",
    "publicKey": [{
      "id": mock.authorizedSignerUrl,
      "type": "CryptographicKey",
      "owner": "https://example.com/i/alpha",
      "publicKeyPem": mock.groups.authorized.publicKey
    }]
  }
};
mock.ldDocuments[mock.authorizedSignerUrl] = {
  "@context": "https://w3id.org/identity/v1",
  "type": "CryptographicKey",
  "owner": "https://example.com/i/alpha",
  "label": "Signing Key 2",
  "id": mock.authorizedSignerUrl,
  "publicKeyPem": mock.groups.authorized.publicKey
};

const bedrock = require('bedrock');
const jsonld = bedrock.jsonld;
const oldLoader = jsonld.documentLoader;
jsonld.documentLoader = function(url, callback) {
  if(Object.keys(mock.ldDocuments).includes(url)) {
    return callback(null, {
      contextUrl: null,
      document: mock.ldDocuments[url],
      documentUrl: url
    });
  }
  // const regex = new RegExp(
  //   'http://authorization.dev/dids' + '/(.*?)$');
  // const didMatch = url.match(regex);
  // if(didMatch && didMatch.length === 2 && didMatch[1] in mock.didDocuments) {
  //   return callback(null, {
  //     contextUrl: null,
  //     document: mock.didDocuments[didMatch[1]],
  //     documentUrl: url
  //   });
  // }
  oldLoader(url, callback);
};
