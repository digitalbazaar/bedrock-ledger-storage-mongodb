# bedrock-ledger-storage-mongodb

A MongoDB ledger storage subsystem for bedrock-ledger that enables the
storage and retrieval of ledgers, blocks, and events. The relationship
of these objects are shown below:

<img alt="Ledgers contain blocks, blocks contain events"
  src="https://w3c.github.io/web-ledger/diagrams/blocks.svg" 
  width=450px;/>

This API exposes the following methods:

* Ledger Storage API
  * api.create(configBlock, meta, options, callback(err, storage))
  * api.get(ledgerId, options, callback(err, storage))
  * api.delete(ledgerId, options, callback(err))
  * api.getLedgerIterator(options, callback(err, iterator))
* Block Storage API
  * storage.blocks.create(block, meta, options, callback(err, result))
  * storage.blocks.get(blockId, options, callback(err, result))
  * storage.blocks.getAll(blockId, options, callback(err, result))
  * storage.blocks.getLatest(options, callback(err, result))
  * storage.blocks.update(blockId, patch, options, callback(err))
  * storage.blocks.delete(blockId, options, callback(err))
* Event Storage API
  * storage.events.create(event, meta, options, callback(err, result))
  * storage.events.get(eventId, options, callback(err, result))
  * storage.events.update(eventId, patch, options, callback(err))
  * storage.events.delete(eventId, options, callback(err))
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

Create a new ledger given an initial configuration block, 
block metadata, and a set of options.

* configBlock - the initial configuration block for the ledger.
* meta - the metadata associated with the configuration block.
* options - a set of options used when creating the ledger.
  *  owner - the owner of the ledger (default: none - public ledger)
  *  eventHasher (required) - the event hashing function to use
  *  blockHasher (required) - the block hashing function to use
* callback(err, storage) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * storage - The storage to use for the purposes of accessing
    and modifying the ledger.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const configBlock = {
    id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1',
    type: 'WebLedgerConfigurationBlock',
    ledger: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59',
    consensusMethod: {
      type: 'Continuity2017'
    },
    configurationAuthorizationMethod: {
      type: 'ProofOfSignature2016',
      approvedSigner: [
        'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
      ],
      minimumSignaturesRequired: 1
    },
    writeAuthorizationMethod: {
      type: 'ProofOfSignature2016',
      approvedSigner: [
        'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144'
      ],
      minimumSignaturesRequired: 1
    },
    signature: {
      type: 'RsaSignature2017',
      created: '2017-10-24T05:33:31Z',
      creator: 'did:v1:53ebca61-5687-4558-b90a-03167e4c2838/keys/144',
      domain: 'example.com',
      signatureValue: 'eyiOiJJ0eXAK...EjXkgFWFO'
    }
  }
};
const meta = {};
const options = {
  eventHasher: myEventHashingFunction,
  blockHasher: myBlockHashingFunction
};

blsMongodb.create(configBlock, meta, options, (err, storage) => {
  if(err) {
    throw new Error('Failed to create ledger:', err);
  }
  
  // use the storage API to read and write to the ledger
  storage.events.create( /* create new events */ );
  storage.blocks.create( /* create new blocks */ );
});
```

### Retrieving a Ledger

Retrieves a storage API for performing operations on a ledger.

* ledgerId - a URI identifying the ledger.
* options - a set of options used when retrieving the storage API.
  *  owner - the owner of the ledger (default: none - public ledger)
  *  eventHasher (required) - the event hashing function to use
  *  blockHasher (required) - the block hashing function to use
* callback(err, storage) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * storage - A ledger storage API.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const ledgerId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
const options = {
  eventHasher: myEventHashingFunction,
  blockHasher: myBlockHashingFunction
};

blsMongodb.get(ledgerId, options, (err, storage) => {
  storage.events.create( /* write new events to the ledger storage */ );
  /* ... perform other operations on ledger storage ... */
});
```

### Delete a Ledger

Deletes a ledger given a set of options.

* ledgerId - the URI of the ledger to delete.
* options - a set of options used when deleting the ledger.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const actor = 'admin';
const ledgerId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
const options = {};

blsMongodb.delete(ledgerId, options, err => {
  if(err) {
    throw new Error('Failed to delete ledger:', err);
  }
  
  console.log('Ledger deletion successful!');
});
```

### Get an Iterator for All Ledgers

Gets an iterator that will iterate over all ledgers in the system.
The iterator will return a ledgerId that can be passed to the
api.get() call to fetch the storage for the associated ledger.

* options - a set of options to use when retrieving the list.
* callback(err, iterator) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * iterator - An iterator that returns ledgerIds

```javascript
const actor = 'admin';
const options = {};

bedrockLedger.getLedgerIterator(options, (err, iterator) => {
  if(err) {
    throw new Error('Failed to fetch iterator for ledgers:', err);
  }
  
  for(let ledgerId of iterator) { 
    console.log('Ledger:',  ledgerId); 
  }
});
```

## Blocks API

The blocks API is used to perform operations on blocks associated with a
particular ledger.

### Create a Block 

Creates a block in the ledger given a block, metadata associated
with the block, and a set of options.

* block - the block to create in the ledger.
* meta - the metadata associated with the block.
* options - a set of options used when creating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the operation.
    * block - the block that was committed to storage.
    * meta - the metadata that was committed to storage.

```javascript
const actor = 'admin';
const block = {
  '@context': 'https://w3id.org/webledger/v1',
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/2',
  type: 'WebLedgerEventBlock',
  event: [/* { ... JSON-LD-OBJECT ... }, ... */],
  previousBlock: 'did:v1:e7adbe7-79f2-425a-9dfb-76a234782f30/blocks/1',
  previousBlockHash: 'ni:///sha-256;cGBSKHn2cBJ563oSt3SAf4OxZXXfwtSxj1xFO5LtkGkW',
  signature: {
    type: 'RsaSignature2017',
    created: '2017-05-10T19:47:15Z',
    creator: 'http://example.com/keys/789',
    signatureValue: 'JoS27wqa...BFMgXIMw=='
  }
};
const meta = {
  pending: true
};
const options = {};

storage.blocks.create(block, options, (err, result) => {
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
const blockId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1';
const options = {};

storage.blocks.get(blockId, options, (err, result) => {
  if(err) {
    throw new Error('Block query failed:', err);
  }
  
  console.log('Block:', result.block, result.meta);
});
```

### Get a All Blocks with ID

Gets all blocks matching a given blockId even if they have not 
achieved consensus.

* blockId - the identifier of the block(s) to fetch from the ledger.
* options - a set of options used when retrieving the block(s).
   * callback(err, iterator) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   iterator - an iterator for all of the returned blocks.

```javascript
const blockId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1';
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

### Get Latest Blocks

Retrieves the latest events block and the latest configuration
block from the ledger.

* options - a set of options used when retrieving the latest blocks.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the latest events and configuration blocks.
    * configurationBlock - the latest configuration block.
    * eventsBlock - the latest events block.

```javascript
const actor = 'admin';
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

Update an existing block in the ledger given a blockId,
an array of patch instructions, and a set of options.

* blockId - the URI of the block to update.
* patch - the patch instructions to execute on the block.
* options - a set of options used when updating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blockId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1';
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
    block: {
      proof: { /* proof goes here */ }
    }
  }
}, {
  op: 'add',
  changes: {
    block: {
      signature: { /* signature goes here */ }
    }
  }
}];
const options = {};

storage.blocks.update(blockId, patch, options, (err) => {
  if(err) {
    throw new Error('Block update failed:', err);
  }
  
  console.log('Block update succeeded.');
});
```

### Delete a Block

Delete a block in the ledger given a block hash and a set of options.

* blockHash - the block with the given hash to delete in the ledger.
* options - a set of options used when deleting the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const blockHash = PREVIOUSLY_CALCULATED_BLOCK_HASH;
const options = {};

storage.blocks.delete(blockHash, options, (err) => {
  if(err) {
    throw new Error('Block delete failed:', err);
  }
  
  console.log('Successfully deleted block.');
});
```

## Events API

The events API is used to perform operations on events associated with a
particular ledger.

### Create an Event 

Creates an event to associate with a ledger given an 
event and a set of options.

* event - the event to associate with a ledger.
* meta - the metadata that is associated with the event.
* options - a set of options used when creating the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the operation.
    * event - the event that was committed to storage.
    * meta - the metadata that was committed to storage.

```javascript
const actor = 'admin';
const event = {
  event: {
    '@context': 'https://schema.org/',
    type: 'Event',
    name: 'Big Band Concert in New York City',
    startDate: '2017-07-14T21:30',
    location: 'https://example.org/the-venue',
    offers: {
      type: 'Offer',
      price: '13.00',
      priceCurrency: 'USD',
      url: 'https://www.ticketfly.com/purchase/309433'
    },
    signature: {
      type: 'RsaSignature2017',
      created: '2017-05-10T19:47:15Z',
      creator: 'https://www.ticketfly.com/keys/789',
      signatureValue: 'JoS27wqa...BFMgXIMw=='
    }
  }
};
const meta = {
  pending: true
};
const options = {};

storage.events.create(event, meta, options, (err, result) => {
  if(err) {
    throw new Error('Failed to create the event:', err);
  }
  
  console.log('Event creation successful:', result.event.id, result.meta);
});
```

### Get an Event

Gets one or more events in the ledger given a 
query and a set of options.

* eventId - the identifier of the event to fetch from storage.
* options - a set of options used when retrieving the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the result of the retrieval
    * event - the event.
    * meta - metadata about the event.

```javascript
const actor = 'admin';
const eventId = 'urn:uuid:049f7d7a-6327-41db-b2cf-9ffa29d3433b';
const options = {};

storage.blocks.get(eventId, options, (err, result) => {
  if(err) {
    throw new Error('Event retrieval failed:', err);
  }
  
  console.log('Event:', result.event, result.meta);
});
```

### Update an Existing Event

Update an existing event associated with the ledger given
an eventId, an array of patch instructions, and a set of options.

* eventId - the ID of the event to update
* patch - a list of patch commands for the event
* options - a set of options used when updating the event.
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the value of the updated event.

```javascript
const eventId = 'urn:uuid:76b17d64-abb1-4d19-924f-427a743489f0';
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
      block: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/2'
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

storage.events.update(eventId, patch, options, (err) => {
  if(err) {
    throw new Error('Event update failed:', err);
  }
  
  console.log('Event update succeeded.');
});
```

### Delete an Event

Delete an event associated with the ledger given an eventId and a set of options.

* eventId - the event to delete.
* options - a set of options used when deleting the event.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const options = {};
const eventId = 'urn:uuid:6b17d64-abb1-4d19-924f-427a743489f0';

storage.events.delete(eventId, options, (err) => {
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
