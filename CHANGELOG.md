# bedrock-ledger-storage-mongodb ChangeLog

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
