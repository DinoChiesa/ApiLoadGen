#! /usr/local/bin/node
/*jslint node:true */

// etl1.js
// ------------------------------------------------------------------
//
// A command-line nodejs script which loads the data from the named
// local file into App Services.  This needs to be run only once per
// job. This script is a supporting tool for the loadgen server.
//
// created: Thu Jul 18 15:54:12 2013
// last saved: <2013-September-18 17:04:43>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------

var assert = require('assert'),
    restify = require('restify'),
    q = require ('q'),
    fs = require('fs'),
    filename, model,
    theJob, promise, requests, s,
    urlPathPrefix = '/dino/loadgen1',
    i, j, L,
    client = restify.createJsonClient({
      url: 'https://api.usergrid.com', // no urlpath allowed
      headers: {
        'accept' : 'application/json'
      }
    });

function logRequest(e, req, res, obj, payload) {
  console.log('\n' + req.method + ' ' + req.path);
  console.log('headers: ' + JSON.stringify(req._headers, null, 2));
  if (payload) {
    console.log('payload: ' + JSON.stringify(payload, null, 2));
  }
  console.log('\nresponse status: ' + res.statusCode);
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n\n');
  assert.ifError(e);
}

function promisifyLoadProfile(profile) {
  return function(context) {
    var deferredPromise = q.defer(),
        urlJobPath = urlPathPrefix + '/jobs/' + context.job.uuid;
    profile.name += '-' + (new Date()).valueOf();
    client.post(urlJobPath + '/uses/loadprofiles', profile,
                function (e, httpReq, httpResp, obj) {
                  logRequest(e, httpReq, httpResp, obj);
                  deferredPromise.resolve(context);
                });
    return deferredPromise.promise;
  };
}

function promisifySequence(seq) {
  return function(context) {
    var deferredPromise = q.defer(),
        urlJobPath = urlPathPrefix + '/jobs/' + context.job.uuid;
    seq.name += '-' + (new Date()).valueOf();
    client.post(urlJobPath + '/includes/sequences', seq,
                function (e, httpReq, httpResp, obj) {
                  logRequest(e, httpReq, httpResp, obj);
                  context.sequence = obj.entities[0];
                  deferredPromise.resolve(context);
                });
    return deferredPromise.promise;
  };
}

function promisifyRequest(req) {
  return function(context) {
    var deferredPromise = q.defer(),
        urlJobPath = urlPathPrefix + '/jobs/' + context.job.uuid;
        url = urlJobPath + '/includes/sequences/' + context.sequence.uuid + '/references/requests';
    req.name += '-' + (new Date()).valueOf();
    client.post(url, req, function (e, httpReq, httpResp, obj) {
      logRequest(e, httpReq, httpResp, obj);
      deferredPromise.resolve(context);
    });
    return deferredPromise.promise;
  };
}


filename = process.argv.slice(2);

if ( ! filename) {
  console.log('specify a filename.');
  process.exit(1);
}
else {
  filename = filename[0];
  if ( ! fs.existsSync(filename)) {
    console.log('that file does not exist.');
    process.exit(1);
  }
}

console.log('=============================================\n1. read the file');
model = JSON.parse(fs.readFileSync(filename, "utf8"));

console.log('=============================================\n2. create a job');
// the job entity consists of a subset of the job object in the model.json file.
theJob = {
  defaultProperties : model.defaultProperties,
  description : model.description,
  name : model.name,
  initialContext : model.initialContext
};

promise = q.resolve({job: theJob})

.then(function(context) {
  var deferredPromise = q.defer();
  client.post(urlPathPrefix + '/jobs', context.job,
              function (e, httpReq, httpResp, obj) {
                logRequest(e, httpReq, httpResp, obj);
                context.job = obj.entities[0];
                deferredPromise.resolve(context);
              });
  return deferredPromise.promise;
});

if (model.loadprofiles) {
  for (i=0, L=model.loadprofiles.length; i<L; i++) {
    lp = model.loadprofiles[i];
    promise = promise.then(promisifyLoadProfile(lp));
  }
}

// process each sequence in order
for (i=0, L=model.sequences.length; i<L; i++) {
  s = model.sequences[i];
  requests = s.requests;
  delete s.requests;

  promise = promise.then(promisifySequence(s));

  for (j=0; j < requests.length; j++) {
    promise = promise.then(promisifyRequest(requests[j]));
  }
}

promise.done(function(context) { console.log('done.'); process.exit(0);});
