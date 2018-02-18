/*!
 * Copyright (c) 2017-2018 Digital Bazaar, Inc. All rights reserved.
 */
const bedrock = require('bedrock');

module.exports =
  bedrock.loggers.get('app').child('ledger-storage-mongodb');
