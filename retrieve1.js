#! /usr/local/bin/node
/*jslint node:true */

// retrieve1.js
// ------------------------------------------------------------------
//
// Retrieve the "job definitions" from App Servies. This is in support
// of a load generator which runs a set of REST requests from Node, to
// generate load for API Proxies, allowing better Analytics charts.
//
// This script uses the restify module for emitting the REST requests. You
// may need to do the following to get pre-requisites before running
// this script:
//
//   npm install restify sleep q
//
// created: Wed Jul 17 18:42:20 2013
// last saved: <2013-July-19 20:26:48>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa and Apigee Corp
// All rights reserved.
//
// ------------------------------------------------------------------

var assert = require('assert'),
    restify = require('restify'),
    q = require ('q'),
    sleep = require('sleep'),
    fs = require('fs'),
    promise,
    modelSourceUrlPrefix = '/dino/loadgen1',
    mClient = restify.createJsonClient({
      url: 'https://api.usergrid.com/',
      headers: {
        'Accept' : 'application/json'
      }
    });

function logTransaction(e, req, res, obj, payload) {
  assert.ifError(e);
  console.log('\n' + req.method + ' ' + req.path);
  console.log('headers: ' + JSON.stringify(req._headers, null, 2));
  if (payload) {
    console.log('payload: ' + JSON.stringify(payload, null, 2));
  }
  console.log('\nresponse status: ' + res.statusCode);
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n\n');
}


function retrieveRequestsForOneSequence(ctx) {
  return (function (context) {
    var deferred, s, url,
        state = context.state,
        model = context.model;

    // check for termination
    if (state.currentSequence == model.jobs[state.currentJob].sequences.length) {
      state.currentJob++;
      return q.resolve(context);
    }

    deferred = q.defer();
    s = model.jobs[state.currentJob].sequences[state.currentSequence];
    url = modelSourceUrlPrefix + s.metadata.connections.references;

    console.log('========================================\nRetrieve requests ');
    mClient.get(url, function(e, httpReq, httpResp, obj) {
      logTransaction(e, httpReq, httpResp, obj);
      s.requests = obj.entities;
      state.currentSequence++;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence);

  }(ctx));
}


function retrieveSequencesForOneJob(ctx) {
  return (function (context) {
    var deferred,
        query = "select * where type = 'sequence'",
        state = context.state,
        model = context.model,
        jobs = model.jobs,
        j, url;

    // check for termination
    if (state.currentJob == model.jobs.length)
      return q.resolve(context);

    deferred = q.defer();
    console.log('========================================\nretrieveSequencesForOneJob');
    j = jobs[state.currentJob];

    url = modelSourceUrlPrefix +
      j.metadata.connections.includes +
      '?ql=' +
      encodeURIComponent(query);

    mClient.get(url, function(e, httpReq, httpResp, obj) {
      logTransaction(e, httpReq, httpResp, obj);
      j.sequences = obj.entities;
      context.state.currentSequence = 0;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence)
      .then(retrieveSequencesForOneJob);

  }(ctx));
}


q
  .fcall(function(){
    console.log('retrieve');
    return {};
  })
  .then(function(state) {
    var deferredPromise = q.defer();
    console.log('===========================================\nRetrieve Jobs');
    mClient.get(modelSourceUrlPrefix + '/jobs', function(e, httpReq, httpResp, obj) {
      logTransaction(e, httpReq, httpResp, obj);
      deferredPromise.resolve({
        state: {currentJob:0, stage:'run'},
        model: {jobs:obj.entities}
      });
    });
    return deferredPromise.promise;
  })

  .then(function(context) {
    console.log('job count: ' + context.model.jobs.length);
    return context;
  })

  .then(retrieveSequencesForOneJob)

  .done(function (context) {
    // context.model.jobs now holds the model for all the jobs
    console.log('================================================');
    console.log('==             Model Retrieved                ==');
    console.log('================================================');
    console.log(JSON.stringify(context, null, 2));
    console.log('done');
    process.exit(0);
  });
