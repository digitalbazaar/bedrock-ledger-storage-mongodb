# bedrock-ledger-storage-mongodb

[![Build Status](https://ci.digitalbazaar.com/buildStatus/icon?job=bedrock-ledger-storage-mongodb)](https://ci.digitalbazaar.com/job/bedrock-ledger-storage-mongodb)

A MongoDB ledger storage subsystem for bedrock-ledger that enables the
storage and retrieval of ledgers, blocks, events, and operations. The
relationship of these objects are shown below:

<img alt= 'Ledgers contain blocks, blocks contain events '
  src= 'https://w3c.github.io/web-ledger/diagrams/blocks.svg '
  width=450px;/>

This API exposes the following methods:

* Ledger Storage API
  * api.add(configEvent, meta, options, callback(err, storage))
  * api.get(storageId, options, callback(err, storage))
  * api.remove(storageId, options, callback(err))
  * api.getLedgerIterator(options, callback(err, iterator))
* Block Storage API
  * storage.blocks.add(block, meta, options, callback(err, result))
  * storage.blocks.get(blockId, options, callback(err, result))
  * storage.blocks.getAll(blockId, options, callback(err, result))
  * storage.blocks.getGenesis(options, callback(err, result))
  * storage.blocks.getLatest(options, callback(err, result))
  * storage.blocks.update(blockHash, patch, options, callback(err))
  * storage.blocks.remove(blockHash, options, callback(err))
* Event Storage API
  * storage.events.add(event, meta, options, callback(err, result))
  * storage.events.get(eventHash, options, callback(err, result))
  * storage.events.getLatestConfig(options, callback(err, result))
  * storage.events.exists(eventHash, callback(err, result))
  * storage.events.update(eventHash, patch, options, callback(err))
  * storage.events.remove(eventHash, options, callback(err))
* Database Driver API
  * storage.driver

##  Configuration

Configuration options and their defaults are documented
in [lib/config.js](lib/config.js).

## Using the API

The API in this module is designed to be used by the
[bedrock-ledger](https://github.com/digitalbazaar/bedrock-ledger/)
module. Do not use this API directly unless you are
creating a new ledger node API.

## Ledger API

The MongoDB ledger storage API is capable of mapping ledger node
storage requests to a set of MongoDB collections.

### Creating a Ledger

Add a new ledger given an initial configuration event,
configuration event metadata, and a set of options.

* configEvent - the initial configuration event for the ledger.
* meta - the metadata associated with the configuration event.
* options - a set of options used when creating the ledger.
* callback(err, storage) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * storage - The storage to use for the purposes of accessing
    and modifying the ledger.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const configEvent = {
  '@context': 'https://w3id.org/webledger/v1',
  type: 'WebLedgerConfigurationEvent',
  ledgerConfiguration: {
    '@context': 'https://w3id.org/example-ledger/v1',
    type: 'WebLedgerConfiguration',
    ledger: 'urn:uuid:651544dc-c029-420d-9d85-3cecad6fc5c5',
    consensusMethod: 'Continuity2017',
    ledgerConfigurationValidator: [],
    operationValidator: [{
      type: 'ExampleValidator2017',
      validatorFilter: [{
        type: 'ValidatorFilterByType',
        validatorFilterByType: [
          CreateWebLedgerRecord,
          UpdateWebLedgerRecord
    ]}]}],
    proof: {
      type: 'RsaSignature2018',
      created: '2018-07-01T18:59:52Z',
      creator: 'did:v1:nym:z2DzQmYumekrfMLh...zSjN5vN8W8g3#authn-key-1',
      jws: 'eyJhbGciO...ltm5VrsXunx-A '
    }
  }
};
const meta = {
  eventHash: myBlockHasher(configEvent),
};
const options = {};

blsMongodb.add(configEvent, meta, options, (err, storage) => {
  if(err) {
    throw new Error('Failed to create ledger:', err);
  }

  // use the storage API to read and write to the ledger
  storage.events.add( /* create new events */ );
  storage.blocks.add( /* create new blocks */ );
});
```

### Retrieving a Ledger

Retrieves a storage API for performing operations on a ledger.

* storageId - a URI identifying the ledger storage.
* options - a set of options used when retrieving the storage API.
* callback(err, storage) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * storage - A ledger storage API.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const storageId = 'urn:uuid:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
const options = {};

blsMongodb.get(storageId, options, (err, storage) => {
  storage.events.add( /* write new events to the ledger storage */ );
  /* ... perform other operations on ledger storage ... */
});
```

### Remove a Ledger

Removes a ledger given a set of options.

* storageId - a URI identifying the ledger storage.
* options - a set of options used when deleting the ledger.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const storageId = 'urn:uuid:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
const options = {};

blsMongodb.remove(storageId, options, err => {
  if(err) {
    throw new Error('Failed to delete ledger:', err);
  }

  console.log('Ledger deletion successful!');
});
```

### Get an Iterator for All Ledgers

Gets an iterator that will iterate over all ledger storage
APIs in the system. The iterator will return a
ledger storage API that can then be used to operate directly on
the ledger storage.

* options - a set of options to use when retrieving the list.
* callback(err, iterator) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * iterator - An iterator that returns ledger storage APIs.

```javascript
const options = {};

bedrockLedger.getLedgerIterator(options, (err, iterator) => {
  if(err) {
    throw new Error('Failed to fetch iterator for ledgers:', err);
  }

  for(let storage of iterator) {
    console.log('Ledger Storage ID:',  storage.id);
  }
});
```

## Blocks API

The blocks API is used to perform operations on blocks associated with a
particular ledger.

### Add a Block

Adds a block in the ledger given a block, metadata associated
with the block, and a set of options.

* block - the block to create in the ledger.
* meta - the metadata associated with the block.
  * blockHash (required) - a unique identifier for the block that
      the storage subsystem will use to index the block.
* options - a set of options used when creating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the operation.
    * block - the block that was committed to storage.
    * meta - the metadata that was committed to storage.

```javascript
const block = {
  @context': 'https://w3id.org/webledger/v1',
  id: 'urn:uuid:cb868833-14df-40a0-bdd3-544f77e0a612/blocks/2',
  type: 'WebLedgerEventBlock',
  event: [/* { ... JSON-LD-OBJECT ... }, ... */],
  previousBlock: 'urn:uuid:cb868833-14df-40a0-bdd3-544f77e0a612/blocks/1',
  previousBlockHash: 'zQmVc1MEd4J3X7UDMojVwU7XN2MRYwvA6zR5wYw1eyJgocv',
  signature: {
    type: 'RsaSignature2018',
    created: '2018-05-10T19:47:15Z',
    creator: 'http://example.com#keys-789',
    jws: 'JoS27wqa...BFMgXIMw=='
  }
};
const meta = {
  blockHash: myBlockHasher(block),
  pending: true
};
const options = {};

storage.blocks.add(block, options, (err, result) => {
  if(err) {
    throw new Error('Failed to create the block:', err);
  }

  console.log('Block creation successful:', result.block, result.meta);
});
```

### Get a Consensus Block

Gets a block that has achieved consensus and its associated metadata
from the ledger given a blockId.

* blockId - the identifier of the consensus block to fetch from the ledger.
* options - a set of options used when retrieving the block.
* callback(err, records) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the retrieval.
    * block - the block.
    * meta - metadata about the block.

```javascript
const blockId = 'urn:uuid:cb868833-14df-40a0-bdd3-544f77e0a612/blocks/1';
const options = {};

storage.blocks.get(blockId, options, (err, result) => {
  if(err) {
    throw new Error('Block query failed:', err);
  }

  console.log('Block:', result.block, result.meta);
});
```

### Get all Blocks with ID

Gets all blocks matching a given blockId even if they have not
achieved consensus.

* blockId - the identifier of the block(s) to fetch from the ledger.
* options - a set of options used when retrieving the block(s).
   * callback(err, iterator) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   iterator - an iterator for all of the returned blocks.

```javascript
const blockId = 'urn:uuid:cb868833-14df-40a0-bdd3-544f77e0a612/blocks/1';
const options = {};

// get all blocks with given blockId
ledgerStorage.blocks.getAll(blockId, options, (err, iterator) => {
  async.eachSeries(iterator, (promise, callback) => {
    promise.then(result => {
      console.log('Got block:', result.meta.blockHash);
      callback();
    });
  });
});
```

### Get Genesis Block

Retrieves the genesis block from the ledger.

* options - a set of options used when retrieving the genesis block.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the genesis block.
    * genesisBlock - the genesis block and meta.

```javascript
const options = {};

storage.blocks.getGenesis(options, (err, result) => {
  if(err) {
    throw new Error('Failed to get genesis block:', err);
  }

  console.log('Genesis block:', result.genesisBlock);
});
```

### Get Latest Blocks

Retrieves the latest events block and the latest configuration
block from the ledger.

* options - a set of options used when retrieving the latest blocks.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the latest events and configuration blocks.
    * configurationBlock - the latest configuration block and meta.
    * eventBlock - the latest event block and meta.

```javascript
const options = {};

storage.blocks.getLatest(options, (err, result) => {
  if(err) {
    throw new Error('Failed to get latest blocks:', err);
  }

  console.log('Latest config block:', result.configurationBlock);
  console.log('Latest events block:', result.eventsBlock);
});
```

### Update an Existing Block

Update an existing block in the ledger given a blockHash,
an array of patch instructions, and a set of options.

* blockHash - the hash of the block to update.
* patch - the patch instructions to execute on the block.
* options - a set of options used when updating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blockHash = 'zQmVc1MEd4J3X7UDMojVwU7XN2MRYwvA6zR5wYw1eyJgocv';
const patch = [{
  op: 'unset',
  changes: {
    meta: {
      pending: 1
    }
  }
}, {
  op: 'set',
  changes: {
    meta: {
      consensus: Date.now()
    }
  }
}, {
  op: 'add',
  changes: {
    meta: {
      someArray: 'c'
    }
  }
}, {
  op: 'remove',
  changes: {
    meta: {
      someOtherArray: 'z'
    }
  }
}];

const options = {};

storage.blocks.update(blockHash, patch, options, (err) => {
  if(err) {
    throw new Error('Block update failed:', err);
  }

  console.log('Block update succeeded.');
});
```

### Remove a Block

Remove a block in the ledger given a block hash and a set of options.

* blockHash - the block with the given hash to delete in the ledger.
* options - a set of options used when deleting the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blockHash = 'zQmVc1MEd4J3X7UDMojVwU7XN2MRYwvA6zR5wYw1eyJgocv';
const options = {};

storage.blocks.remove(blockHash, options, (err) => {
  if(err) {
    throw new Error('Block delete failed:', err);
  }

  console.log('Successfully deleted block.');
});
```

## Events API

The events API is used to perform operations on events associated with a
particular ledger.

### Add an Event

Adds an event to associate with a ledger given an
event and a set of options.

* event - the event to associate with a ledger.
* meta - the metadata that is associated with the event.
  * eventHash (required) - a unique identifier for the event that
      the storage subsystem will use to index the event.
* options - a set of options used when creating the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the operation.
    * event - the event that was committed to storage.
    * meta - the metadata that was committed to storage.

```javascript
const event = {
  @context: 'https://w3id.org/webledger/v1',
  type: 'ContinuityMergeEvent',
  parentHash: [ 'zQmZ3QU3hitUmuZh2KgkKHZJ5Dh7hGvNfLRKJ6cusKCzuRF' ],
  proof: {
    type: 'Ed25519Signature2018',
    created: '2018-08-16T13:25:14Z',
    creator: 'https://example.com/.../voters/zQmQNQwo...hTvbWxUrGgh9GP',
    jws: 'eyJhbGciO...RurJsUXZnyxBg'
  }
};

const meta = {
  eventHash: myEventHasher(event),
  pending: true
};
const options = {};

storage.events.add(event, meta, options, (err, result) => {
  if(err) {
    throw new Error('Failed to create the event:', err);
  }

  console.log('Event creation successful:', result.event, result.meta);
});
```

### Get an Event

Gets one or more events in the ledger given a query and a set of options.

* eventHash - the identifier of the event to fetch from storage.
* options - a set of options used when retrieving the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the retrieval
    * event - the event.
    * meta - metadata about the event.

```javascript
const eventHash = 'zQmNVs8dM6sEmyQiFUkqRWXFUjhzp7mCfnPJKK6pWmgr4uJ';
const options = {};

storage.events.get(eventHash, options, (err, result) => {
  if(err) {
    throw new Error('Event retrieval failed:', err);
  }

  console.log('Event:', result.event, result.meta);
});
```

### Determine If an Event Exists

Determine if one or more events exist given the event hash(es);

* eventHash - a string or array of event hashes.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the check: true if all the events exist, false if
      *any* of the events do not exist.

```javascript
const eventHash = 'zQmNVs8dM6sEmyQiFUkqRWXFUjhzp7mCfnPJKK6pWmgr4uJ';

storage.events.exists(eventHash, (err, result) => {
  if(err) {
    throw new Error('Event retrieval failed:', err);
  }
  if(result) {
    console.log('The event exists.');
  } else {
    console.log('The event does not exist.');
  }
});
```

### Get the Latest Config Event

Gets the latest configuration event that has consensus.

* options - a set of options used when retrieving the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the retrieval
    * event - the event.
    * meta - metadata about the event.

```javascript
const options = {};

storage.events.getLatestConfig(options, (err, result) => {
  if(err) {
    throw new Error('Config event retrieval failed:' + err);
  }

  console.log('Latest config event:', result.event, result.meta);
});
```

### Update an Existing Event

Update an existing event associated with the ledger given
an eventHash, an array of patch instructions, and a set of options.

* eventHash - the ID of the event to update
* patch - a list of patch commands for the event
* options - a set of options used when updating the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the value of the updated event.

```javascript
const eventHash = 'zQmTjnK9iQGrGeEWvv37L63JTmSBiLMpVWx6aD1e1YzDuc5';
const patch = [{
  op: 'delete',
  changes: {
    meta: {
      pending: true
    }
  }
}, {
  op: 'set',
  changes: {
    meta: {
      block: 'urn:uuid:cb868833-14df-40a0-bdd3-544f77e0a612/blocks/2'
    }
  }
}, {
  op: 'add',
  changes: {
    event: {
      signature: { /* signature goes here */ }
    }
  }
}];
const options = {};

storage.events.update(eventHash, patch, options, (err) => {
  if(err) {
    throw new Error('Event update failed:', err);
  }

  console.log('Event update succeeded.');
});
```

### Remove an Event

Remove an event associated with the ledger given an event hash and a set
of options.

* eventHash - the hash of the event to delete.
* options - a set of options used when deleting the event.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const eventHash = 'zQmNVs8dM6sEmyQiFUkqRWXFUjhzp7mCfnPJKK6pWmgr4uJ';
const options = {};

storage.events.remove(eventHash, options, (err) => {
  if(err) {
    throw new Error('Event delete failed:', err);
  }

  console.log('Successfully deleted event.');
});
```

## Raw Driver API

The raw driver API enables access to the low level database driver.
Usage of the raw driver to enact database changes is strongly
discouraged as it breaks the storage layer abstraction.

```javascript
const mongodbDriver = storage.driver
```
