# bedrock-ledger-storage-mongodb ChangeLog

## 3.0.0 - 2019-10-22

## Changed
- **BREAKING**: Refactor for use with bedrock@2.

## 2.4.0 - 2019-05-20

### Added
- Estimate BSON document sizes before passing into the Mongo `insertMany` API.
  If the document exceeds the Mongo 16MB document size limit, separate the
  array into multiple chunks.

## 2.3.0 - 2019-03-25

### Changed
- Use bedrock-ledger-node@8.

## 2.2.0 - 2019-02-14

### Added
- Added index on `meta.operationHash` in support of `operations.exists` API.

## 2.1.0 - 2019-01-11

### Changed
- Allow `maxBlockHeight` of zero in the `getRecordHistory` API.

## 2.0.0 - 2018-12-31

### Removed
- **BREAKING** Remove support for `creator` in events.

### Changed
- **BREAKING** Change `getActiveConfiguration` API to
  `getEffectiveConfiguration`.
- **BREAKING** Valid ledger configurations are identified by a
  `meta.effectiveConfiguration` flag.
- Make `eventHash` parameter optional in `operations.exists`

## 1.2.0 - 2018-12-12

### Added
- Support for `creator` in events.

## 1.1.0 - 2018-12-05

### Added
- Implement `basisBlockHeight`. `basisBlockHeight` is used to record on what
  basis ledger operations were validated. `basisBlockHeight` is recorded in
  `WebLedgerConfigurationEvent` and `WebLedgerOperationEvent` events. Peers
  receiving these types of events via gossip should validate the events and
  operations based on the state of the ledger indicated by `basisBlockHeight`.

## 1.0.1 - 2018-09-20

### Changed
- Use bedrock-validation 3.x in the test suite.

## 1.0.0 - 2018-09-11

- See git history for changes previous to this release.

## 0.2.0 - 2017-06-16

- Initial stable implementation.

## 0.1.0 - 2017-05-27

- Unstable stubs and implementation.
