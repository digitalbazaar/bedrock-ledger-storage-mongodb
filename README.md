# bedrock-ledger-storage-mongodb

A MongoDB storage subsystem for bedrock-ledger.

## API Configuration

Configuration options and their defaults are documented 
in [lib/config.js](lib/config.js).

## Using the API

The API in this module is designed to be used by the
[bedrock-ledger](https://github.com/digitalbazaar/bedrock-ledger/)
module. Do not use this API directly unless you are
creating a new ledger node API.

```javascript
let blStorage = require('bedrock-ledger-storage-mongodb');

const actor = { /* actor performing the operation */ };
const configBlock = { /* block config stuff goes here */ };
const options = { /* ledger config options go here */ };

blStorage.createLedger(actor, configBlock, options, (err, ledger) => {
  if(err) {
    throw new Error('Failed to create ledger:', err);
  }
  
  console.log('Ledger created', ledger);
});
```

## MongoDB Ledger Storage API

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
  * operation - the operation to perform on the block.
    * set - replace the entire block with ```block```
    * update - only update the fields specified in ```block```
    * delete - only delete the fields specified in ```block```
  * meta - the metadata fields to update
    * operation - the operation to perform on the block.
      * set - replace the entire block with ```block```
      * update - only update the fields specified in ```block```
      * delete - only delete the fields specified in ```block```
* callback(err, result) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.
  * result - the value of the updated block.

```javascript
const query = {
  id: 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59/blocks/1'
};
const options = {};

storage.blocks.update(actor, query, options, (err, blocks) => {
  if(err) {
    throw new Error("Block query failed:", err);
  }
  
  console.log("Blocks matching query:", blocks);
});
```
### Delete a Block

Delete a block in the ledger given a blockID and a set of options.

* actor - the actor performing the action.
* blockId - the block to delete in the ledger.
* options - a set of options used when creating the block.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise.

```javascript
const options = {};

storage.blocks.delete(actor, blockId, options, (err) => {
  if(err) {
    throw new Error("Block delete failed:", err);
  }
  
  console.log('Successfully deleted block.');
});
```

## Events API

### events.create(event, options, callback)

### events.get(event, options, callback)

### events.update(eventId, event, options, callback)

### events.delete(eventId, options, callback)

## Raw Driver API

### driver.get()
