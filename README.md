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

### Creating a Ledger

Create a new ledger given a ledgerId, initial configuration
block, and a set of options.

* actor - the actor performing the action.
* ledgerId - a URI identifying the ledger.
* configBlock - the initial configuration block for the ledger.
* options - a set of options used when creating the ledger.
* callback(err, ledger) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * ledger - A ledger object containing the latest 
  ```configurationBlock``` as well as the ```latestBlock``` 
  that has achieved consensus

```javascript

const ledgerId = 'did:v1:eb8c22dc-bde6-4315-92e2-59bd3f3c7d59';
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
};

const options = {};

blStorage.create(actor, ledgerId, configBlock, options, (err, ledger) => {
  if(err) {
    throw new Error("Failed to create ledger:", err);
  }
  
  console.log("Ledger created", ledger);
});
```

### Delete a Ledger

Deletes a ledger given a ledgerId and a set of options.

* actor - the actor performing the action.
* ledgerId - a URI identifying the ledger.
* options - a set of options used when deleting the ledger.
* callback(err) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise

```javascript
blStorage.delete(actor, ledgerId, {}, err => {
  if(err) {
    throw new Error("Failed to delete ledger:", err);
  }
  
  console.log("Ledger deletion successful", ledger);
});
```

### Retrieve a Ledger

Get a ledger given a ledgerId and a set of options.

* actor - the actor performing the action.
* ledgerId - a URI identifying the ledger.
* options - a set of options used when retrieving the ledger.
* callback(err, ledger) - the callback to call when finished.
  * err - An Error if an error occurred, null otherwise
  * ledger - A ledger object containing the latest 
  ```configurationBlock``` as well as the ```latestBlock``` 
  that has achieved consensus

```javascript
blStorage.get(actor, ledgerId, {}, err => {
  if(err) {
    throw new Error("Failed to delete ledger:", err);
  }
  
  console.log("Ledger deletion successful", ledger);
});
```

## Blocks API

### blocks.create(block, options, callback)

### blocks.get(block, options, callback)

### blocks.update(blockId, block, options, callback)

### blocks.delete(blockId, options, callback)

## Events API

### events.create(event, options, callback)

### events.get(event, options, callback)

### events.update(eventId, event, options, callback)

### events.delete(eventId, options, callback)

## Raw Driver API

### driver.get()
