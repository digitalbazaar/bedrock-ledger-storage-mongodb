/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');
require('bedrock-identity');
require('bedrock-mongodb');
require('bedrock-ledger-storage-mongodb');
require('bedrock-ledger-context');

require('bedrock-test');
bedrock.start();
