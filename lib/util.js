/*!
 * Copyright (c) 2017-2020 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const BSON = require('bson');

const MAX_CHUNK_SIZE = 250;
// max MongoDB document size leaving 5% for data structure overhead, see:
// https://github.com/digitalbazaar/bedrock-ledger-storage-mongodb/issues/47
const MAX_BATCH_SIZE_BYTES = Math.round(1024 * 1024 * 16 * .95);

exports.chunkDocuments = documents => {
  const chunks = [];
  let chunk = [];
  let chunkBytes = 0;
  for(let i = 0; i < documents.length; ++i) {
    const opBytes = BSON.calculateObjectSize(documents[i]);
    if(chunk.length <= MAX_CHUNK_SIZE &&
      (chunkBytes + opBytes) <= MAX_BATCH_SIZE_BYTES) {
      chunk.push(documents[i]);
      chunkBytes += opBytes;
    } else {
      // start a new chunk
      chunks.push(chunk);
      chunk = [documents[i]];
      chunkBytes = opBytes;
    }
    // if this is the last document, push the chunk
    if(i === documents.length - 1) {
      chunks.push(chunk);
    }
  }

  return chunks;
};

exports.hasValue = (obj, key, value) => [].concat(obj[key]).includes(value);
