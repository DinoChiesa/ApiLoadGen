#! /usr/local/bin/node
/*jslint node:true */

// etl1.js
// ------------------------------------------------------------------
//
// Load the model from model.json local file, into App Services.
// This needs to be run only once.
//
// created: Thu Jul 18 15:54:12 2013
// last saved: <2013-July-23 11:47:26>
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
    filename = "model.json",
    model = JSON.parse(fs.readFileSync(filename, "utf8")),
    newJob, newSequence, newRequest, requestHash,
    requestRefs, 
    promise, urlPath1, urlPath2,
    s, r, findFn, selection,
    urlPathPrefix = '/dino/loadgen1',
    i, j, L,
    client = restify.createJsonClient({
      url: 'https://api.usergrid.com', // no urlpath allowed
      headers: {
        'accept' : 'application/json'
      }
    });

function getUuidFinder(uuid) {
  return function (elt, ix, a) {
    return (elt.myUuid === uuid);
  };
}

// function copyObjProps(src, dst, propList) {
//   var i, L, prop;
//   for (i=0, L=propList.length; i<L; i++) {
//     prop = propList[i];
//     if (src.hasOwnProperty(prop)) {
//       dst[prop] = src[prop];
//     }
//   }
// }

function logRequest(e, req, res, obj, payload) {
  assert.ifError(e);
  console.log('\n' + req.method + ' ' + req.path);
  console.log('headers: ' + JSON.stringify(req._headers, null, 2));
  if (payload) {
    console.log('payload: ' + JSON.stringify(payload, null, 2));
  }
  console.log('\nresponse status: ' + res.statusCode);
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n\n');
}


function promisifySequence(seq) {
  return function() {
    var deferredPromise = q.defer();
    client.post(urlPathPrefix + urlPath1, seq,
                function (e, httpReq, httpResp, obj) {
                  logRequest(e, httpReq, httpResp, obj);
                  newSequence = obj.entities[0];
                  urlPath2 = '/sequences/' + newSequence.uuid + '/references/requests';
                  console.log('urlPath2: ' + urlPath2);
                  deferredPromise.resolve(true);
                });
    return deferredPromise.promise;
  };
}

function promisifyRequest(req) {
  return function() {
    var deferredPromise = q.defer();
    client.post(urlPathPrefix + urlPath2, req,
                function (e, httpReq, httpResp, obj) {
                  logRequest(e, httpReq, httpResp, obj);
                  newRequest = obj.entities[0];
                  requestHash[req.myUuid] = newRequest.uuid;
                  deferredPromise.resolve(true);
                });
    return deferredPromise.promise;
  };
}



console.log('=============================================\n1. create a job');
newJob = {};
newJob.defaultProperties = model.defaultProperties;
newJob.description = model.description;

promise = q.fcall(function(){})

.then(function() {
  var deferredPromise = q.defer();
  client.post(urlPathPrefix + '/jobs', newJob,
              function (e, httpReq, httpResp, obj) {
                logRequest(e, httpReq, httpResp, obj);
                newJob = obj.entities[0];
                deferredPromise.resolve(true);
              });
  return deferredPromise.promise;
})

.then(function() {
  console.log('=============================================\n2. create sequence entities');
  urlPath1 = '/jobs/' + newJob.uuid + '/includes/sequences';
  console.log('urlPath1: ' + urlPath1);
  requestHash = {};
});


// process each sequence in order

for (i=0, L=model.sequences.length; i<L; i++) {
  s = model.sequences[i];
  requestRefs = s.requestRefs;
  delete s.requestRefs;

  promise = promise.then(promisifySequence(s));

  for (j=0; j < requestRefs.length; j++) {
    r = requestRefs[j];
    findFn = getUuidFinder(r);
    selection = model.requests.filter(findFn);
    promise = promise.then(promisifyRequest(selection[0]));
  }

  // promise = promise
  //   .then(function() {
  //     var i, L1, prop, ri, wrapper,
  //         deferredPromise = q.defer();
  //     console.log('=============================================\nupdate request references');
  //     console.log('requestHash: ' + JSON.stringify(requestHash, null, 2));
  //     console.log('requestImpls (BEFORE): ' + JSON.stringify(newSequence.requestImpls, null, 2));
  //     // fixup references?...
  //     for (i=0, L1=newSequence.requestImpls.length; i<L1; i++) {
  //       ri = newSequence.requestImpls[i];
  //       for (prop in requestHash) {
  //         if (requestHash.hasOwnProperty(prop)) {
  //           // if old 'requestRef' points to old uuid, apply the new uuid
  //           if (prop === ri.requestRef) {
  //            ri.requestRef = requestHash[prop];
  //           }
  //         }
  //       }
  //     }
  //     console.log('requestImpls (AFTER): ' + JSON.stringify(newSequence.requestImpls, null, 2));
  //     wrapper = {requestImpls : newSequence.requestImpls};
  //     client.put(urlPathPrefix + '/sequences/' + newSequence.uuid, wrapper,
  //                function (e, httpReq, httpResp, obj) {
  //                  logRequest(e, httpReq, httpResp, obj);
  //                  requestHash = {}; // reset for next loop
  //                  deferredPromise.resolve(true);
  //                });
  //     return deferredPromise.promise;
  //   });
}



// promise = promise.then(function() {
//   console.log('=============================================\n3. create request entities');
//   urlPath = '/jobs/' + newJob.uuid + '/references/requests';
//   console.log('urlPath: ' + urlPath);
// });
//
//
// // process each request in order
// for (i=0, L=model.requests.length; i<L; i++) {
//   s = model.requests[i];
//   promise = promise.then(function() {
//     var deferredPromise = q.defer();
//     client.post(urlPathPrefix + urlPath, s,
//                 function (e, httpReq, httpResp, obj) {
//                   logRequest(e, httpReq, httpResp, obj);
//                   deferredPromise.resolve(true);
//                 });
//     return deferredPromise.promise;
//   });
// }

promise.done(function() { console.log('done.'); process.exit(0);});
