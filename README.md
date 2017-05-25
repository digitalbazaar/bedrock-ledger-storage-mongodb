# bedrock-ledger-storage-mongodb

A MongoDB storage subsystem for bedrock-ledger.

## Using the API

```javascript
let blStorage = require('bedrock-ledger-storage-mongodb);

blStroage.
```

## Ledger API

create(configBlock, options, callback)
delete(ledgerId, options, callback)
get(ledgerId, options, callback)

## Blocks API

blocks.create(block, options, callback)
blocks.get(block, options, callback)
blocks.update(blockId, block, options, callback)
blocks.delete(blockId, options, callback)

## Events API

events.create(event, options, callback)
events.get(event, options, callback)
events.update(eventId, event, options, callback)
events.delete(eventId, options, callback)

## Raw Driver API

driver.get()
