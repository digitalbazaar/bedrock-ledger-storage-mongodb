/*!
 * Ledger event storage class.
 *
 * Copyright (c) 2017 Digital Bazaar, Inc. All rights reserved.
 */
const _ = require('lodash');
const async = require('async');
const bedrock = require('bedrock');
const brPermission = require('bedrock-permission');
const config = require('bedrock').config;
const database = require('bedrock-mongodb');
const BedrockError = bedrock.util.BedrockError;

// module permissions
const PERMISSIONS = bedrock.config.permission.permissions;

// module API
const api = {};
module.exports = api;

/**
 * The events API is used to perform operations on events associated
 * with a particular ledger.
 */
class LedgerEventStorage {
  constructor(ledgerId) {

  }

  /**
   * Creates an event to associate with a ledger given an event and a set of
   * options.
   *
   * actor - the actor performing the action.
   * event - the event to associate with a ledger.
   * meta - the metadata that is associated with the event.
   * options - a set of options used when creating the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the operation.
   *   event - the event that was committed to storage.
   *   meta - the metadata that was committed to storage.
   */
  create(actor, event, meta, options, callback) {

  }

  /**
   * Gets one or more events in the ledger given a query and a set of
   * options.
   *
   * actor - the actor performing the action.
   * eventId - the identifier of the event to fetch from storage.
   * options - a set of options used when retrieving the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the result of the retrieval
   *   event - the event.
   *   meta - metadata about the event.
   */
  get(actor, eventId, options, callback) {

  }

  /**
   * Update an existing event associated with the ledger given an
   * eventId, an array of patch instructions, and a set of options.
   *
   * actor - the actor performing the action.
   * eventId - the ID of the event to update
   * patch - a list of patch commands for the event
   * options - a set of options used when updating the event.
   * callback(err, result) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   *   result - the value of the updated event.
   */
  update(actor, eventId, patch, options, callback) {

  }

  /**
   * Delete an event associated with the ledger given an eventId and a
   * set of options.
   *
   * actor - the actor performing the action.
   * eventId - the event to delete.
   * options - a set of options used when deleting the event.
   * callback(err) - the callback to call when finished.
   *   err - An Error if an error occurred, null otherwise.
   */
  delete(actor, eventId, options, callback) {

  }
}

api.LedgerEventStorage = LedgerEventStorage;
