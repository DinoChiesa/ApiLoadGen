#! /usr/local/bin/node
/*jslint node:true */

// run3.js
// ------------------------------------------------------------------
//
// Run a set of REST requests from Node. This is to generate load for
// API Proxies, according to the jobs stored in App Services.  The first
// step is to retrieve the "job definition" from App Servies; then it is
// necessary to make all the calls defined in the job.
//
// This script uses the restify module for emitting the REST requests. You
// may need to do the following to get pre-requisites before running
// this script:
//
//   npm install restify sleep q
//
// created: Wed Jul 17 18:42:20 2013
// last saved: <2013-July-23 12:33:43>
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
    //fs = require('fs'),
    wantContinuousRunning,
    sleepTimeInMs = 5 * 60 * 1000, // not really - this discounts runtime
    //sleepTimeInMs = 30 * 1000, // for testing only
    globalContext,
    modelSourceUrlPrefix = '/dino/loadgen1',
    mClient = restify.createJsonClient({
      url: 'https://api.usergrid.com/',
      headers: {
        'Accept' : 'application/json'
      }
    });


// Math.uuid = function() {
//   return '********-****-4***-y***-************'.replace(/[\*y]/g, function(c) {
//     var r = Math.random()*16|0,
//         v = (c == '*') ? r : (r&0x3|0x8);
//     return v.toString(16);
//   });
// };

function noop() {}

function getUuidFinder(uuid) {
  return function (elt, ix, a) {
    return (elt.uuid === uuid);
  };
}


function logTransaction(e, req, res, obj, payload) {
  console.log('\n' + req.method + ' ' + req.path);
  console.log('headers: ' + JSON.stringify(req._headers, null, 2));
  if (payload) {
    console.log('payload: ' + JSON.stringify(payload, null, 2));
  }
  console.log('\nresponse status: ' + res.statusCode);
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n\n');
  assert.ifError(e);
}

function trackFailure(e) {
  console.log('failure: ' + e);
}


function resolveNumeric(input) {
  var I = input;
  if (typeof input == "undefined") {
    I = 1;
  }
  else if (typeof input == "string") {
    I = eval('(' + input + ')');
  }
  return I;
}

function evalTemplate(ctx, code) {
  var src = '(function (', c = 0, f, values = [], result,
      extractContext = ctx.state.extracts[ctx.state.job];
  for (var prop in extractContext) {
    if (extractContext.hasOwnProperty(prop)) {
      if (c > 0) {src += ',';}
      src += prop;
      values.push(extractContext[prop]);
      c++;
    }
  }
  src += '){return ' + code + ';})';
  //console.log('evaluating: ' + src);
  f = eval(src);
  result = f.apply(null, values);
  //console.log('result: ' + result);
  return result;
}

function expandEmbeddedTemplates(ctx, obj) {
  // walks through an object, replacing each embedded template
  // as appropriate.
  var re = new RegExp('(.*){(.+)}(.*)'), newObj = {}, match,
      type = Object.prototype.toString.call(obj), x, i;
  if (type === "[object Array]") {
    // iterate
    newObj = [];
    for (i=0; i<obj.length; i++) {
      x = expandEmbeddedTemplates(ctx, obj[i]);
      newObj.push(x);
    }
  }
  else if (type === "[object Object]") {

    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        type = Object.prototype.toString.call(obj[prop]);
        if (type === "[object String]") {
          match = re.exec(obj[prop]);
          if (match) {
            // expand template for this prop
            newObj[prop] = match[1] + evalTemplate(ctx, match[2]) + match[3];
          }
          else {
            newObj[prop] = obj[prop];
          }
        }
        else if (type === "[object Array]") {
          // iterate
          newObj[prop] = [];
          for (i=0; i<obj[prop].length; i++) {
            x = expandEmbeddedTemplates(ctx, obj[prop][i]);
            newObj[prop].push(x);
          }
        }
        else if (type === "[object Object]") {
          // recurse
          newObj[prop] = expandEmbeddedTemplates(ctx, obj[prop]);
        }
        else {
          newObj[prop] = obj[prop];
        }
      }
    }
  }
  return newObj;
}


// ==================================================================

// *************************************************************
// Retrieval logic here.
// The following functions retrieve the jobs from App Services.

function retrieveJobs() {
  var deferredPromise = q.defer();
  console.log('===========================================\nRetrieve Jobs');
  mClient.get(modelSourceUrlPrefix + '/jobs', function(e, httpReq, httpResp, obj) {
    logTransaction(e, httpReq, httpResp, obj);
    deferredPromise.resolve({
      state: {job:0, stage:'retrieve'},
      model: {jobs:obj.entities}
    });
  });
  return deferredPromise.promise;
}

function retrieveRequestsForOneSequence(ctx) {
  return (function (context) {
    var deferred, s, url,
        state = context.state,
        model = context.model;

    // check for termination
    if (state.currentSequence == model.jobs[state.job].sequences.length) {
      state.job++;
      return q.resolve(context);
    }

    deferred = q.defer();
    s = model.jobs[state.job].sequences[state.currentSequence];
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

function reportJobCount(context) {
  console.log('job count: ' + context.model.jobs.length);
  return context;
}

function reportModel (context) {
  // context.model.jobs now holds the model for all the jobs
  console.log('================================================');
  console.log('==             Model Retrieved                ==');
  console.log('================================================');
  console.log(JSON.stringify(context, null, 2));
  return context;
}


function retrieveSequencesForEachJob(ctx) {
  return (function (context) {
    var deferred,
        query = "select * where type = 'sequence'",
        state = context.state,
        model = context.model,
        jobs = model.jobs,
        j, url;

    // check for termination
    if (state.job == model.jobs.length)
      return q.resolve(context);

    deferred = q.defer();
    console.log('========================================\nretrieveSequencesForOneJob');
    j = jobs[state.job];

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
      .then(retrieveSequencesForEachJob);

  }(ctx));
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function initializeRunStateAndKickoff(context) {
  // initialize context for running
  context.state = {
    state:'run',
    job: 0,
    J : context.model.jobs.length,
    sequence : 0,
    S : context.model.jobs[0].sequences.length,
    request : 0,
    R : context.model.jobs[0].sequences[0].requests.length,
    iteration : 0,
    I : [] // resolveNumeric(context.model.jobs[0].sequences[0].iterations)
  };

  return q.resolve(context)
    .then(runJobs);
}


function invokeOneRequest(context) {
  var re = new RegExp('(.*){(.+)}(.*)'),
      deferred = q.defer(),
      model = context.model,
      state = context.state,
      sequence = model.jobs[state.job].sequences[state.sequence],
      job = model.jobs[state.job],
      req = sequence.requests[state.request],
      suffix = req.pathSuffix,
      match = re.exec(req.pathSuffix),
      actualPayload,
      client, p = q.resolve(context);

  console.log('=================== invokeOneRequest');

  if (state.job === 0 && state.request === 0 &&
      state.sequence === 0 && state.iteration === 0) {
        // initialize restify client
        state.headerInjector = noop;
        state.restClient = restify.createJsonClient({
          url: job.defaultProperties.scheme + '://' + job.defaultProperties.host,
          headers: job.defaultProperties.headers,
          signRequest : function(r) { return state.headerInjector(r);}
        });
  }
  client = state.restClient;

  if (req.delayBefore) {
    p = p.then(function(ctx){
      sleep.usleep(req.delayBefore * 1000);
      return ctx;
    });
  }

  if (match) {
    // The pathsuffix includes a replacement string.
    // Must evaluate the replacement within the promise chain.
    p = p.then(function(ctx){
      suffix = match[1] + evalTemplate(ctx, match[2]) + match[3];
      return ctx;
    });
  }

  // inject custom headers...
  if (req.headers) {
    // set a new headerInjector for our purpose
    //console.log('r[' + r.uuid + '] HAVE HEADERS');

    p = p.then(function(ctx) {
      ctx.state.headerInjector = function (clientRequest) {
        // The header is still mutable using the setHeader(name, value),
        // getHeader(name), removeHeader(name)
        var match, value;
        for (var hdr in req.headers) {
          if (req.headers.hasOwnProperty(hdr)) {
            match = re.exec(req.headers[hdr]);
            if (match) {
              value = match[1] + evalTemplate(ctx, match[2]) + match[3];
            }
            else {
              value = req.headers[hdr];
            }
            //console.log('setHeader(' + hdr + ',' + value + ')');
            clientRequest.setHeader(hdr, value);
          }
        }
      };
      return ctx;
    });
  }

  p = p.then(function(ctx) {
    var deferredPromise = q.defer(),
        respHandler = function(e, httpReq, httpResp, obj) {
          var i, L, ex;
          //assert.ifError(e);
          logTransaction(e, httpReq, httpResp, obj);
          // perform any extraction required for the request
          if (req.extracts && req.extracts.length>0) {
            // cache the extract functions
            if ( ! ctx.state.extracts) { ctx.state.extracts = []; }
            if( ! ctx.state.extracts[state.job]) { ctx.state.extracts[state.job] = {}; }
            for (i=0, L=req.extracts.length; i<L; i++) {
              ex = req.extracts[i];
              if ( ! ex.compiledFn) {
                console.log('eval: ' + ex.fn);
                ex.compiledFn = eval('(' + ex.fn + ')');
              }
              console.log(ex.description);
              ctx.state.extracts[state.job][ex.valueRef] = ex.compiledFn(obj);
              // console.log('extractContext: ' +
              //             JSON.stringify(ctx.state.extracts[state.job], null, 2));
            }
          }
          else {
            // console.log('-no extracts-');
          }
          ctx.state.request++;
          deferredPromise.resolve(ctx);
        };

    if (req.method.toLowerCase() === "post") {
      console.log('post ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.post(suffix, actualPayload, respHandler);
    }
    else if (req.method.toLowerCase() === "put") {
      console.log('put ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.put(suffix, actualPayload, respHandler);
    }
    else if (req.method.toLowerCase() === "get") {
      console.log('get ' + suffix);
      client.get(suffix, respHandler);
    }
    else {
      assert.fail(req.method,"get|post|put", "unsupported method", "<>");
    }
    return deferredPromise.promise;
  });

  // reset the headerInjector
  p = p.then(function(ctx) { ctx.state.headerInjector = noop; return ctx;});

  return p;
}


function runJobs(context) {
  var state = context.state,
      model = context.model,
      jobs = model.jobs,
      p, job, sequence;

  console.log('++++++++++++++++++++++++++++++++++++++++++++ runJobs ');

  // check for termination.
  // This is an unrolled version of a 4-level-deep nested loop
  if (state.request === state.R) {
    state.request = 0;
    state.iteration++;
    console.log('+++++++ next Iteration');
    return q.resolve(context).then(runJobs);
  }
  if (state.iteration === state.I[state.sequence]) {
    state.iteration = 0;
    state.sequence++;
    console.log('+++++++ next Sequence');
    return q.resolve(context).then(runJobs);
  }
  if (state.sequence === state.S) {
    state.sequence = 0;
    state.job++;
    console.log('+++++++ next Job');
    return q.resolve(context).then(runJobs);
  }
  if (state.job === state.J) {
    // terminate
    state.job = 0;
    return q.resolve(context);
  }
  else {
    // reset counts and fall through
    state.S = model.jobs[state.job].sequences.length;
    state.R = model.jobs[state.job].sequences[state.sequence].requests.length;
    if ( ! state.I[state.sequence]) {
      state.I[state.sequence] = resolveNumeric(model.jobs[state.job].sequences[state.sequence].iterations);
    }
    console.log('R ' + (state.request + 1) + '/' + state.R +
                ' I ' + (state.iteration + 1) + '/' + state.I[state.sequence] +
                ' S ' + (state.sequence + 1) + '/' + state.S +
                ' J ' + (state.job + 1) + '/' + state.J );
  }

  // if we arrive here we're doing a request, implies an async call
  p = q.resolve(context)
    .then(invokeOneRequest);

  // sleep if necessary
  sequence = model.jobs[state.job].sequences[state.sequence];
  if (state.request === 0 && state.iteration !== 0) {
    if (sequence.delayBetweenIterations) {
      p = p.then(function(c) {
        sleep.usleep(resolveNumeric(sequence.delayBetweenIterations) * 1000);
        return c; // for chaining
      });
    }
  }

  return p.then(runJobs, trackFailure);
}


function stopRunning(context) {
  console.log('+++++++ done with jobs');
  process.exit(0);
}

function setWakeup(context) {
  // set context for waiting
  context.state.state = 'wait';
  globalContext = context;
  console.log((new Date()).toString());
  console.log('sleeping...');
  setTimeout(function () {
       q.resolve(globalContext)
        .then(initializeRunStateAndKickoff)
        .then(setWakeup);

    }, sleepTimeInMs);
  return context;
}


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// true for continuous running, false => one run only
wantContinuousRunning = true;

p = q
  .fcall(retrieveJobs)
  .then(reportJobCount)
  .then(retrieveSequencesForEachJob)
  .then(reportModel)
  .then(initializeRunStateAndKickoff);

if (wantContinuousRunning) {
  p = p.then(setWakeup).done();
}
else {
  p = p.then(stopRunning).done();
}
