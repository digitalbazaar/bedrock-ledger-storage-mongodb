# bedrock-ledger-storage-mongodb

A MongoDB ledger storage subsystem for bedrock-ledger. This API exposes
the following methods:

* Ledger Storage API
  * api.getStorage(ledgerId, options, callback(err, storage))
  * storage.create(actor, configBlock, options, callback(err, ledger))
  * storage.delete(actor, options, callback(err))
* Blocks API
  * storage.blocks.create(actor, block, options, callback(err))
  * storage.blocks.get(actor, query, options, callback(err, blocks))
  * storage.blocks.update(actor, block, options, callback(err, block, meta))
  * storage.blocks.delete(actor, blockId, options, callback(err))
* Events API
  * storage.events.create(actor, event, options, callback(err))
  * storage.events.get(actor, query, options, callback(err, events))
  * storage.events.update(actor, event, options, callback(err, event, meta))
  * storage.events.delete(actor, eventId, options, callback(err))
* Low-level Driver API
  * storage.driver.get()

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

### Get the Ledger API

Retrieves an API for performing operations on a ledger.

* ledgerId - a URI identifying the ledger.
* options - a set of options used when retrieving the ledger API.
* callback(err, storage) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * storage - A ledger storage API

```javascript
const blsMongodb = require('bedrock-ledger-storage-mongodb');

const ledgerId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
const options = {};

blsMongodb.getStorage(ledgerId, options, (err, storage) => {
  storage.events.create( /* write new events to the ledger storage */ );
  /* ... perform other operations on ledger storage ... */
});
```

### Creating a Ledger

Create a new ledger given an initial configuration block, 
and a set of options.

* actor - the actor performing the action.
* configBlock - the initial configuration block for the ledger.
* options - a set of options used when creating the ledger.
* callback(err, ledger) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * ledger - A ledger object containing the latest 
  ```configurationBlock``` as well as the ```latestBlock``` 
  that has achieved consensus

```javascript

const configBlock = {
    id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1',
    type: 'WebLedgerConfigurationBlock',
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
const options = {};

storage.create(actor, configBlock, options, (err, ledger) => {
  if(err) {
    throw new Error("Failed to create ledger:", err);
  }
  
  console.log("Ledger created", ledger);
});
```

### Delete a Ledger

Deletes a ledger given a set of options.

* actor - the actor performing the action.
* options - a set of options used when deleting the ledger.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise

```javascript
storage.delete(actor, {}, err => {
  if(err) {
    throw new Error("Failed to delete ledger:", err);
  }
  
  console.log("Ledger deletion successful!");
});
```

## Blocks API

The blocks API is used to perform operations on blocks associated with a
particular ledger.

### Create a Block 

Creates a block in the ledger given a block and a set of options.

* actor - the actor performing the action.
* block - the block to create in the ledger.
* options - a set of options used when creating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

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
}
const options = {};

storage.blocks.create(actor, block, options, err => {
  if(err) {
    throw new Error("Failed to create the block:", err);
  }
  
  console.log("Block creation successful.");
});
```

### Get a Block 

Gets one or more blocks in the ledger given a 
query and a set of options.

* actor - the actor performing the action.
* query - a query that matches one or more blocks
  * id - the blockID to search for
* options - a set of options used when creating the block.
  * pending - if true, get all pending blocks
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const query = {
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1'
};
const options = {};

storage.blocks.get(actor, query, options, (err, blocks) => {
  if(err) {
    throw new Error("Block query failed:", err);
  }
  
  console.log("Blocks matching query:", blocks);
});
```

### Update an Existing Block 

Update an existing block in the ledger given
a block update and a set of options.

* actor - the actor performing the action.
* block - the new values for the block.
* options - a set of options used when creating the block.
  * blockOperation - the operation to perform on the block.
    * set - replace the entire block with ```block```
    * update - only update the fields specified in ```block```
    * delete - only delete the fields specified in ```block```
  * metaOperation - the operation to perform on the metadata.
    * set - replace the entire block with ```block```
    * update - only update the fields specified in ```block```
    * delete - only delete the fields specified in ```block```
  * meta - the metadata fields to modify
    * pending - true if the block is pending consensus
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the value of the updated block.

```javascript
// remove the pending flag metadata for a block
const block = {
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1'
};
const options = {
  metaOperation: 'delete',
  meta: {
    pending: 0
  }
};

storage.blocks.update(actor, block, options, (err, block, meta) => {
  if(err) {
    throw new Error("Block update failed:", err);
  }
  
  console.log("Block update success:", block, meta);
});
```
### Delete a Block

Delete a block in the ledger given a blockID and a set of options.

* actor - the actor performing the action.
* blockId - the block to delete in the ledger.
* options - a set of options used when deleting the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const options = {};
const blockId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1';

storage.blocks.delete(actor, blockId, options, (err) => {
  if(err) {
    throw new Error("Block delete failed:", err);
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

* actor - the actor performing the action.
* event - the event to associate with a ledger.
* options - a set of options used when creating the event.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const actor = 'admin';
const event = {
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
const options = {};

storage.events.create(actor, event, options, (err, event) => {
  if(err) {
    throw new Error("Failed to create the event:", err);
  }
  
  console.log('Event creation successful:', event.id);
});
```

### Get an Event

Gets one or more events in the ledger given a 
query and a set of options.

* actor - the actor performing the action.
* query - a query that matches one or more events
  * id - the event identifier to search for
* options - a set of options used when retrieving the event.
  * pending - if true, get all pending events
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const query = {
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/events/76b17d64-abb1-4d19-924f-427a743489f0'
};
const options = {};

storage.events.get(actor, query, options, (err, events) => {
  if(err) {
    throw new Error("Event query failed:", err);
  }
  
  console.log("Events matching query:", events);
});
```

### Update an Existing Event

Update an existing event associated with the ledger given
an event update and a set of options.

* actor - the actor performing the action.
* event - the new values for the event.
* options - a set of options used when updating the event.
  * eventOperation - the operation to perform on the event.
    * set - replace the entire event with ```event```
    * update - only update the fields specified in ```event```
    * delete - only delete the fields specified in ```event```
  * metaOperation - the operation to perform on the metadata.
    * set - replace the entire event with ```event```
    * update - only update the fields specified in ```event```
    * delete - only delete the fields specified in ```event```
  * meta - the metadata fields to modify
    * pending - true if the event is pending consensus
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the value of the updated event.

```javascript
// remove the pending flag metadata for an event
const event = {
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/events/76b17d64-abb1-4d19-924f-427a743489f0'
};
const options = {
  metaOperation: 'set',
  meta: {
    block: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/2'
  }
};

storage.events.update(actor, event, options, (err, event, meta) => {
  if(err) {
    throw new Error("Event update failed:", err);
  }
  
  console.log("Event update success:", event, meta);
});
```
### Delete an Event

Delete an event associated with the ledger given an eventId and a set of options.

* actor - the actor performing the action.
* eventId - the event to delete.
* options - a set of options used when deleting the event.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const options = {};
const eventId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/events/76b17d64-abb1-4d19-924f-427a743489f0';

storage.events.delete(actor, eventId, options, (err) => {
  if(err) {
    throw new Error("Event delete failed:", err);
  }
  
  console.log('Successfully deleted event.');
});
```

## Raw Driver API

The raw driver API enables access to the low level database driver. 
Usage of the raw driver to enact database changes is strongly 
discouraged as it breaks the storage layer abstraction.

```javascript
const mongodbDriver = storage.driver.get();
```
