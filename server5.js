// server5.js
// ------------------------------------------------------------------
//
// Job control server implemented using Express. App Services is the
// backing store.
//
//   POST /token  - to authenticate
//   GET /users/:userid
//   GET /jobs
//   POST /jobs - create a new job
//   GET /jobs/:jobid
//   DELETE /jobs/:jobid - delete a job
//   POST /jobs/{job-id}?action={start|stop}
//   ...and maybe a few other calls.
//
// You have to install the pre-requisites in order to run this code:
//
//    npm install
//
//
// created: Mon Jul 22 03:34:01 2013
// last saved: <2013-September-24 21:17:02>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------

var assert = require('assert'),
    q = require ('q'),
    sleep = require('sleep'),
    http = require('http'),
    request = require('./slimNodeHttpClient.js'),
    WeightedRandomSelector = require('./weightedRandomSelector.js'),
    Base64 = require('./base64.js'),
    express = require('express'),
    app = express(),
    server,
    citySelector,
    log = new Log(),
    activeJobs = {}, pendingStop = {},
    oneHourInMs = 60 * 60 * 1000,
    fiveMinutesInMs = 5 * 60 * 1000,
    minSleepTimeInMs = 18000,
    defaultRunsPerHour = 60,
    isUrl = new RegExp('^https?://[-a-z0-9\\.]+($|/)', 'i'),
    ugBase = 'https://api.usergrid.com',
    cityPopUrlPrefix = ugBase + '/dino/loadgen1',
    ipDatabase = 'https://api.usergrid.com/mukundha/testdata/cities',
    tokenHash = [],
    reUuidStr = '[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}',
    reUuid = new RegExp(reUuidStr);

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}


function Log(id) { }

Log.prototype.write = function(str) {
  var time = (new Date()).toString(), me = this;
  console.log('[' + time.substr(11, 4) + '-' +
              time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
              time.substr(16, 8) + '] ' + str );
};


function modelSourceUrlPrefix(obj) {
  return ugBase + '/' + obj.org + '/' + obj.app;
}

function splitOrgappHeader(hdr) {
  var m = hdr.split(':');
  if ( ! m || m.length != 2) {
    throw "invalid value";
  }
  return {org:m[0], app:m[1]};
}

function getModelOptions(param) {
  var authz, uri, token, orgapp, type, hdrs = {
    'Accept' : 'application/json',
    'user-agent' : 'SlimHttpClient/1.0'
  };

  // This fn can be called with either an inbound request, or with a
  // context. The context contains a child 'modelConnection' while the
  // inbound request contains a child called 'headers'.

  // This fn assigns the headers and the uri for the outbound request.
  // The URI will connext to app services, to a specific org and app.
  // The org and app is retrieved directly from the context, or from an
  // in-memory hash using the token as a key.

  if (param) {
    if (param.modelConnection) {
      authz = param.modelConnection.authz;
      if (param.modelConnection.orgapp) {
        orgapp = param.modelConnection.orgapp;
      }
    }
    else if (param.headers) {
      authz = param.headers.authorization || param.headers.Authorization;
    }

    if (authz) { hdrs.authorization = authz; }
    if (!orgapp) {
      token = authz ? extractBearerToken(authz) : null;
      orgapp = (token) ? tokenHash[token] : null;
      if ( ! orgapp) {
        if (param.headers && param.headers['x-appsvcs']) {
          // This is a token we have not seen. Need to extract the set
          // the urlpath, and then store the org/app if the token is
          // valid.
          orgapp = splitOrgappHeader(param.headers['x-appsvcs']);
        }
      }
    }
    else {
      type = getType(orgapp);
      if (type === "[object String]") {
        orgapp = splitOrgappHeader(orgapp);
      }
    }
    uri = (orgapp) ? modelSourceUrlPrefix(orgapp) : '';
  }

  return {
    uri : uri,
    headers: hdrs
  };
}




function extractBearerToken(authzHdr) {
  if ( !authzHdr || !authzHdr.startsWith('Bearer ')) {
    return null;
  }
  return authzHdr.slice(7);
}


function getType(obj) {
  return Object.prototype.toString.call(obj);
}


function copyHash(obj) {
  var copy = {};
  if (null !== obj && typeof obj == "object") {
    for (var attr in obj) {
      if (obj.hasOwnProperty(attr)) {copy[attr] = obj[attr];}
    }
  }
  return copy;
}

function combineProps(obj1, obj2) {
  var newObj = {}, prop;
  if (obj1) {
    for (prop in obj1) { newObj[prop] = obj1[prop]; }
  }
  // obj2 overrides obj1
  if (obj2) {
    for (prop in obj2) { newObj[prop] = obj2[prop]; }
  }
  return newObj;
}


function dumpRequest(req) {
  var r = '';
  // for (var prop in req) {
  //   if (req.hasOwnProperty(prop)) {
  //     r += 'req.' + prop + '\n';
  //   }
  // }
  // return r;
  return JSON.stringify(req.headers, null, 2);
}


function logTransaction(e, ignoreThis, res, obj, payload) {
  //console.log('\n' + req.method + ' ' + req.path);
  //console.log('headers: ' + JSON.stringify(req._headers, null, 2));
  if (payload) {
    console.log('payload: ' + JSON.stringify(payload, null, 2));
  }
  if (res && res.statusCode) {
    console.log('\nresponse status: ' + res.statusCode);
  }
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n');
}


function retrieveAllJobs(ctx) {
  var deferredPromise = q.defer(),
      requestOpts = getModelOptions(ctx);

  log.write('retrieveAllJobs');
  requestOpts.uri += '/jobs';
  request.get(requestOpts, function(e, httpResp, body) {
    var obj;
    if (e) {
      deferredPromise.resolve({
        state: {job:0, stage:'retrieve', error:e},
        model: {jobs:{}},
        modelConnection: copyHash(ctx.modelConnection)
      });
    }
    else {
      try {
        obj = JSON.parse(body);
      }
      catch (exc1) {
        obj = null;
      }

      if (obj && obj.entities && obj.entities[0]) {
        deferredPromise.resolve({
          state: {job:0, stage:'retrieve'},
          model: {jobs: obj.entities},
          modelConnection: copyHash(ctx.modelConnection)
        });
      }
      else {
        console.log('non response? ' + body);
        deferredPromise.resolve({
          state: {job:0, stage:'nojob', jobid:ctx.jobid},
          model: {},
          modelConnection: copyHash(ctx.modelConnection)
        });
      }
    }
  });
  return deferredPromise.promise;
}


function retrieveOneJob(ctx) {
  var deferredPromise = q.defer(),
      requestOpts = getModelOptions(ctx);

  log.write(ctx.jobid + ' retrieveOneJob');
  requestOpts.uri += '/jobs/' + ctx.jobid;
  request.get(requestOpts, function(e, httpResp, body) {
    var obj;
    if (e) {
      console.log('error: ' + JSON.stringify(e, null, 2));
      deferredPromise.resolve({
        state: {job:0, stage:'nojob', jobid:ctx.jobid, error:e},
        model: {},
        modelConnection: copyHash(ctx.modelConnection)
      });
    }
    else {
      try {
        obj = JSON.parse(body);
      }
      catch (exc1) {
        obj = null;
      }

      if (obj && obj.entities && obj.entities[0]) {
        deferredPromise.resolve({
          state: {job:0, stage:'retrieve', jobid:ctx.jobid},
          model: {jobs: obj.entities},
          modelConnection: copyHash(ctx.modelConnection)
        });
      }
      else {
        console.log('non response? ' + JSON.stringify(body, null, 2));
        deferredPromise.resolve({
          state: {job:0, stage:'nojob', jobid:ctx.jobid},
          model: {},
          modelConnection: copyHash(ctx.modelConnection)
        });
      }
    }

  });
  return deferredPromise.promise;
}



function deleteOneJob(ctx) {
  var deferredPromise = q.defer(),
      requestOpts = getModelOptions(ctx);

  log.write(ctx.jobid + ' deleteOneJob');
  requestOpts.uri += '/jobs/' + ctx.jobid;
  request.del(requestOpts, function(e, httpResp, body) {
    var obj;
    if (e) {
      console.log('error: ' + JSON.stringify(e, null, 2));
      deferredPromise.resolve({
        status: httpResp.statusCode,
        state: "error",
        message: JSON.stringify(e, null, 2)
      });
    }
    else {
      try {
        obj = JSON.parse(body);
      }
      catch (exc1) {
        obj = null;
      }

      if (obj && obj.entities && obj.entities[0]) {
        deferredPromise.resolve({
          state: "ok",
          entity: obj.entities[0],
          status: 200
        });
      }
      else {
        console.log('non response? ' + JSON.stringify(body, null, 2));
        deferredPromise.resolve({ state: "inconsistent", status:500 });
      }
    }
  });
  return deferredPromise.promise;
}


function updateOneJob(ctx) {
  var deferredPromise = q.defer(),
      requestOpts = getModelOptions(ctx);

  log.write(ctx.jobid + ' updateOneJob');
  requestOpts.uri += '/jobs/' + ctx.jobid;
  requestOpts.json = ctx.body;

  request.put(requestOpts, function(e, httpResp, body) {
    var obj;
    if (e) {
      console.log('error: ' + JSON.stringify(e, null, 2));
      deferredPromise.resolve({
        status: httpResp.statusCode,
        state: "error",
        message: JSON.stringify(e, null, 2)
      });
    }
    else {
      try {
        obj = JSON.parse(body);
      }
      catch (exc1) {
        obj = null;
      }

      if (obj && obj.entities && obj.entities[0]) {
        deferredPromise.resolve({
          state: "ok",
          entity: obj.entities[0],
          status: 200
        });
      }
      else {
        console.log('non response? ' + JSON.stringify(body, null, 2));
        deferredPromise.resolve({ state: "inconsistent", status:500 });
      }
    }
  });
  return deferredPromise.promise;
}


// ==================================================================

function trackFailure(e) {
  if (e) {
    log.write('failure: ' + e);
  }
  else {
    log.write('unknown failure?');
  }
}


function resolveNumeric(input) {
  var I = input;
  if (typeof input == "undefined") {
    I = 1;
  }
  else if (typeof input == "string") {
    try {
      I = eval('(' + input + ')');
    }
    catch (exc1) {
      I = 0;
    }
  }
  return I;
}


function evalTemplate(ctx, code) {
  var src = '(function (', c = 0, f, values = [], result,
      extractContext = ctx.state.extracts;

  // log.write('eval: ' + code);
  // log.write('ctx: ' + JSON.stringify(extractContext, null, 2));
  // TODO: cache this?
  // create the fn signature
  for (var prop in extractContext) {
    if (extractContext.hasOwnProperty(prop)) {
      if (c > 0) {src += ',';}
      src += prop;
      values.push(extractContext[prop]);
      c++;
    }
  }
  src += '){return ' + code + ';})';
  log.write('evalTemplate: ' + src);
  try {
    f = eval(src);
    // call the function with all its arguments
    result = f.apply(null, values);
  }
  catch (exc1) {
    r = null;
  }
  return result;
}



// expandEmbeddedTemplates: walks through an object, replacing each embedded
// template as appropriate. This is used to expand a templated payload.
function expandEmbeddedTemplates(ctx, obj) {
  var re1 = new RegExp('(.*)(?!{{){([^{}]+)(?!}})}(.*)'),
      re2 = new RegExp('(.*){{([^{}]+)}}(.*)'),
      newObj = {}, match, newVal,
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
          // replace all templates in the string
          for (newVal = obj[prop], match = re1.exec(newVal); match; match = re1.exec(newVal)){
            newVal = match[1] + evalTemplate(ctx, match[2]) + match[3];
          }
          for (match = re2.exec(newVal); match; match = re2.exec(newVal)){
            newVal = match[1] + '{' + match[2] + '}' + match[3];
          }

          newObj[prop] = newVal;
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
          // no replacement
          newObj[prop] = obj[prop];
        }
      }
    }
  }
  return newObj;
}


// ==================================================================

function invokeOneRequest(context) {
  var re = new RegExp('(.*){(.+)}(.*)'),
      model = context.model,
      state = context.state,
      sequence = model.jobs[state.job].sequences[state.sequence],
      job = model.jobs[state.job],
      req = sequence.requests[state.request],
      url = req.url || req.pathSuffix,
      match = re.exec(url),
      actualPayload,
      headers = (job.defaultProperties && job.defaultProperties.headers) ? job.defaultProperties.headers : {},
      reqOptions = { headers: headers},
      p = q.resolve(context);

  log.write(job.uuid + ' invokeOneRequest');

  // 1. delay as appropriate
  if (req.delayBefore) {
    p = p.then(function(ctx){
      sleep.usleep(req.delayBefore * 1000);
      return ctx;
    });
  }

  // 2. run any imports.
  if (req.imports && req.imports.length>0) {
    p = p.then(function(ctx){
      var imp, i, L;
      // cache the eval'd import functions
      for (i=0, L=req.imports.length; i<L; i++) {
        imp = req.imports[i];
        if ( ! imp.compiledFn) {
          log.write('eval: ' + imp.fn);
          imp.compiledFn = eval('(' + imp.fn + ')');
        }
        log.write(imp.description);
        // actually invoke the compiled fn
        try {
          ctx.state.extracts[imp.valueRef] = imp.compiledFn(ctx.state.extracts);
          log.write(imp.valueRef + ':=' + JSON.stringify(ctx.state.extracts[imp.valueRef]));
        }
        catch (exc1) {
          ctx.state.extracts[imp.valueRef] = null;
          log.write(imp.valueRef + ':= null (exception: ' + exc1 + ')');
        }
      }
      return ctx;
    });
  }

  // 3. evaluate the url path if required.
  if (match) {
    // The url includes at least one template.
    // Must do replacements within the promise chain.
    p = p.then(function(ctx){
      // there may be multiple templates; must evaluate all of them
      var v = url;
      for (; match && v; match = re.exec(v)) {
        v = evalTemplate(ctx, match[2]);
        v = (v) ? (match[1] + v + match[3]) : null;
      }
      url = v ? v : "";
      return ctx;
    });
  }

  // 4. conditionally set additional headers for this request.
  if (req.headers) {
    p = p.then(function(ctx) {
      var match, value;
      for (var hdr in req.headers) {
        if (req.headers.hasOwnProperty(hdr)) {
          value = req.headers[hdr];
          match = re.exec(value);
          if (match) {
            // replace all templates until done
            for (; match; match = re.exec(value)) {
              value = match[1] + evalTemplate(ctx, match[2]) + match[3];
            }
          }
          else {
            value = req.headers[hdr];
          }
          log.write('setHeader(' + hdr + ',' + value + ')');
          reqOptions.headers[hdr.toLowerCase()] = value;
        }
      }
      return ctx;
    });
  }

  // 5. actually do the http call, and run the subsequent extracts
  p = p.then(function(ctx) {
    var deferredPromise = q.defer(),
        city,
        method = (req.method)? req.method.toLowerCase() : "get",
        respCallback = function(e, httpResp, body) {
          var i, L, ex, obj;
          if (e) {
            log.write(e);
          }
          else if (req.extracts && req.extracts.length>0) {
            // cache the eval'd extract functions
            // if ( ! ctx.state.extracts) { ctx.state.extracts = {}; }
            for (i=0, L=req.extracts.length; i<L; i++) {
              ex = req.extracts[i];
              if ( ! ex.compiledFn) {
                log.write('eval: ' + ex.fn);
                ex.compiledFn = eval('(' + ex.fn + ')');
              }
              log.write(ex.description);
              // actually invoke the compiled fn
              try {
                // sometimes the body is already parsed into an object?
                obj = Object.prototype.toString.call(body);
                if (obj === '[object String]') {
                  try {
                    obj = JSON.parse(body);
                  }
                  catch (exc1){
                    // possibly it was not valid json
                    obj = null;
                  }
                }
                else {
                  obj = body;
                }
                ctx.state.extracts[ex.valueRef] = ex.compiledFn(obj, httpResp.headers);
                log.write(ex.valueRef + ':=' + JSON.stringify(ctx.state.extracts[ex.valueRef]));
              }
              catch (exc1) {
                ctx.state.extracts[ex.valueRef] = null;
                log.write(ex.valueRef + ':= null (exception: ' + exc1 + ')');
              }
            }
          }
          ctx.state.request++;
          deferredPromise.resolve(ctx);
        };

    reqOptions.method = method;
    reqOptions.followRedirects = false;
    reqOptions.uri =
      (isUrl.test(url)) ? url :
      job.defaultProperties.scheme + '://' + job.defaultProperties.host + url;

    // Select a random city to insert into the headers.
    // In the future this will be X-Forwarded-For.
    //city = citySelector.select()[0];
    if (job.hasOwnProperty('contrivedIp') && job.contrivedIp) {
      reqOptions.headers['x-random-city'] = job.chosenCity;
      reqOptions.headers['x-forwarded-for'] = job.contrivedIp;
    }
    else {
      log.write('no contrived IP');
    }

    log.write(method + ' ' + reqOptions.uri);

    if (method === "post" || method === "put") {
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      reqOptions.json = actualPayload;
      request(reqOptions, respCallback);
    }
    else if (method === "get" || method === "delete") {
      request(reqOptions, respCallback);
    }
    else {
      assert.fail(r.method,"get|post|put|delete", "unsupported method", "<>");
    }
    return deferredPromise.promise;
  });

  return p;
}


function retrieveCityPops(ctx) {
  var deferredPromise = q.defer(),
      options = {
        uri: cityPopUrlPrefix + '/cities?limit=1000',
        method: 'get',
        headers: {
          'Accept' : 'application/json',
          'user-agent' : 'SlimHttpClient/1.0'
        }
      };

  log.write('retrieveCityPops');

  request(options, function(e, httpResp, body) {
    var a, type, cities;
    if (e) {
      log.write('retrieveCityPops, error: ' + e);
    }
    else {
      type = getType(body);
      if (type === "[object String]") { body = JSON.parse(body); }
      cities = body.entities.map(function(elt) {
        return [ elt, Number(elt.pop2010) ];
      });
      citySelector = new WeightedRandomSelector(cities);
      log.write('retrieveCityPops done');
    }
    deferredPromise.resolve(ctx);
  });
  return deferredPromise.promise;
}


function chooseRandomIpFromRecord(rec) {
  var ranges, numRanges, selectedRange,
      start, end, index,
      selected, w, x, y, z, allGood;
  if ( ! rec) { return null;}

  // It's possible we'lll get bad data from the request, in which case
  // rec.ranges may be invalid. Or, any of the other successive fields
  // may be invalid. In that case, bail.
  allGood = (ranges = rec.ranges) &&
    (numRanges = ranges.length) &&
    (selectedRange = ranges[Math.floor(Math.random() * numRanges)]) &&
    (start = parseInt(selectedRange[0], 10)) &&
    (end = parseInt(selectedRange[1], 10)) &&
    (index = Math.floor(Math.random()*(start-end))) &&
    (selected = start + index) &&
    (w =  Math.floor(( selected / 16777216 ) % 256)) &&
    (x =  Math.floor(( selected / 65536    ) % 256)) &&
    (y =  Math.floor(( selected / 256      ) % 256)) &&
    (z =  Math.floor(( selected            ) % 256));

  if (allGood)
    return w + "." + x + "." + y + "." + z ;

  return null;
}


function contriveIpAddress(context) {
  var city = citySelector.select()[0],
      ql = 'select * where city=\'' + city.name + '\'' ,
      options = {
        uri : ipDatabase + '?ql=' + encodeURIComponent(ql),
        method: 'get',
        headers: {
          'Accept' : 'application/json',
          'user-agent' : 'SlimHttpClient/1.0'
        }
      },
      deferred = q.defer();

  log.write('contriveIpAddress');

  request(options, function(e, httpResp, body) {
    var type;
    if (e) {
      log.write('contriveIpAddress, error: ' + e);
    }
    else {
      type = Object.prototype.toString.call(body);
      body = (type === '[object String]') ? JSON.parse(body) : body;
      if (body.entities && body.entities[0]) {
        context.model.jobs[0].contrivedIp = chooseRandomIpFromRecord(body.entities[0]);
        context.model.jobs[0].chosenCity = city.name;
        log.write('contriveIpAddress: ' + city.name + ' ' + context.model.jobs[0].contrivedIp);
      }
      else {
        log.write('contriveIpAddress: no body entities');
      }
    }
    deferred.resolve(context);
  });

  return deferred.promise;
}



function runJob(context) {
  var state = context.state,
      model = context.model,
      job = model.jobs[0],
      p, sequence;

  // check for termination.
  if (pendingStop.hasOwnProperty(job.uuid)) {
    // terminate
    state.sequence = 0;
    return q.resolve(context).then(function(c){
      log.write('stopping...');
      delete pendingStop[job.uuid];
      delete activeJobs[job.uuid];
      return c;
    });
  }

  // This is an unrolled version of a 3-level-deep nested loop
  if (state.request === state.R) {
    state.request = 0;
    state.iteration++;
    log.write('++ Iteration');
    return q.resolve(context).then(runJob);
  }
  if ( !state.I[state.sequence] && state.sequence < state.S) {
    state.I[state.sequence] = resolveNumeric(job.sequences[state.sequence].iterations);
  }
  if (state.I[state.sequence] && state.iteration === state.I[state.sequence]) {
    state.iteration = 0;
    state.sequence++;
    log.write('++ Sequence');
    return q.resolve(context).then(runJob, trackFailure);
  }
  if (state.sequence === state.S) {
    // terminate
    state.sequence = 0;
    return q(context).then(setWakeup, trackFailure);
  }

  // need to verify that all properties are valid.
  // Sometimes they are not due to intermittent data retrieval errors.
  // in which case, just sleep and try again at next interval.
  if ( ! (job.sequences && job.sequences.length && (state.sequence < job.sequences.length) &&
          job.sequences[state.sequence].requests && job.sequences[state.sequence].requests.length)) {
            return q.resolve(context)
      .then(function(c){
        log.write('state error');
        return c;
      })
      .then(setWakeup);
  }

  // set and log counts
  state.S = job.sequences.length;
  state.R = job.sequences[state.sequence].requests.length;
  if ( ! state.I[state.sequence]) {
    state.I[state.sequence] = resolveNumeric(job.sequences[state.sequence].iterations);
  }
  log.write('R ' + (state.request + 1) + '/' + state.R +
            ' I ' + (state.iteration + 1) + '/' + state.I[state.sequence] +
            ' S ' + (state.sequence + 1) + '/' + state.S);


  // if we arrive here we're doing a request, implies an async call
  p = q.resolve(context);

  // generate a random IP address if necessary
  if (state.request === 0 && state.iteration === 0 && state.sequence === 0) {
    if (!job.hasOwnProperty('geoDistribution') || job.geoDistribution == 1) {
      if (!citySelector) {
        p = p.then(retrieveCityPops);
      }
      p = p.then(contriveIpAddress);
    }
    else {
      p = p.then(function(ctx){
        log.write('no geo distribution');
      });
    }
  }

  // do the call
  p = p.then(invokeOneRequest, trackFailure);

  // sleep if necessary
  sequence = job.sequences[state.sequence];
  if (state.request === 0 && state.iteration !== 0) {
    if (sequence.delayBetweenIterations) {
      p = p.then(function(c) {
        var t = resolveNumeric(sequence.delayBetweenIterations);
        sleep.usleep(t * 1000);
        return c; // context, for chaining
      });
    }
  }

  return p.then(runJob);
}


function initializeJobRunAndKickoff(context) {
  var now = (new Date()).valueOf(), error;
  log.write("initializeJobRunAndKickoff");
  // initialize context for running
  if (!context.model.jobs || !context.model.jobs.length) {error = '-no jobs-';}
  else if (!context.model.jobs[0]) {error = '-no job-';}
  else if (!context.model.jobs[0].sequences ||
           !context.model.jobs[0].sequences.length) {error = '-no sequences-';}
  else if (!context.model.jobs[0].sequences[0].requests ||
           !context.model.jobs[0].sequences[0].requests.length) {error = '-no requests-';}

  if (error) {
    log.write(error);
    context.state.sequence = 0;
    context.state.start = now;
    // nothing more to do?

    // Something went wrong with the GET /jobs/{jobid} from the store.  If the
    // failure during retrieval of job information is temporary, then this case
    // should continue with a setWakeup; this will result in trying to retrieve
    // the job definition again, after a little delay.  If the job has been
    // removed and is no longer available in the store (404), then the this case
    // should stop.
    if (context.state.error) {
      if (context.state.error.statusCode === 404) {
        return q(context); // and stop
      }
      return q(context).then(setWakeup);
    }
    return q(context).then(setWakeup);
  }

  context.state = {
    state: 'run',
    job: 0,
    sequence : 0,
    S : context.model.jobs[0].sequences.length,
    request : 0,
    R : context.model.jobs[0].sequences[0].requests.length,
    iteration : 0,
    I : [],
    extracts: copyHash(context.initialExtractContext),
    start : now
  };

  return q(context).then(runJob);
}


// setWakeup - schedule the next wakeup for a job, after it has completed.
function setWakeup(context) {
  var jobid,
      startContext = context.startContext,
      now = new Date(),
      currentHour = now.getHours(),
      durationOfLastRun = now - context.state.start,
      runsPerHour, sleepTimeInMs;

  if (context.model.jobs && context.model.jobs[0]) {
    jobid = context.model.jobs[0].uuid;
    delete context.model.jobs[0].contrivedIp;
  }
  else if (context.state.jobid) {
    jobid = context.state.jobid;
  }
  else {
    jobid = "nnn";
    log.write("context: " + JSON.stringify(context, null, 2));
  }
  log.write(jobid + ' setWakeup');

  // compute and validate the sleep time
  if (currentHour < 0 || currentHour > 23) { currentHour = 0;}
  runsPerHour = (context.model.jobs &&
                 context.model.jobs[0].invocationsPerHour &&
                 context.model.jobs[0].invocationsPerHour[currentHour]) ?
    context.model.jobs[0].invocationsPerHour[currentHour] : defaultRunsPerHour;

  sleepTimeInMs =
    Math.floor(oneHourInMs / runsPerHour) - durationOfLastRun;

  if (sleepTimeInMs < minSleepTimeInMs) { sleepTimeInMs = minSleepTimeInMs; }

  log.write(jobid + ' ' + runsPerHour + ' runs per hour');
  log.write(jobid + ' sleep ' + sleepTimeInMs + 'ms, wake at ' +  new Date(now.valueOf() + sleepTimeInMs).toString().substr(16, 8));

  activeJobs[jobid] =
    setTimeout(function () {
      var startMoment = new Date().valueOf();
      activeJobs[jobid] = 0; // mark this job as "running" (not waiting)
      log.write(jobid + ' awake');
      q({jobid:jobid, modelConnection: context.modelConnection})
        .then(retrieveOneJob)
        .then(function(ctx) {
          var jobs = (ctx && ctx.model && ctx.model.jobs) ? ctx.model.jobs : [];
          if ( ! jobs[0]) {
            return ctx;
          }
          log.write('setting initial extract context');
          // The context must renew for every run of the job. But
          // there's an "startContext", which may include passwords,
          // that has to be merged with the initialContext for the bootstrap.
          log.write('startContext: ' + JSON.stringify(startContext,null,2));
          ctx.startContext = copyHash(startContext);
          ctx.initialExtractContext = combineProps(ctx.model.jobs[0].initialContext,
                                                   startContext);
          ctx.state.start = startMoment;
          return ctx;
        })
        .then(initializeJobRunAndKickoff)
        .done(function(){},
              function(e){
                log.write('unhandled error: ' + e);
                log.write(e.stack);
              });
    }, sleepTimeInMs);
  return context;
}


// ******************************************************************

function myCorsHandler(req, res, next) {
  // handle CORS
  if (req.method.toLowerCase() === 'options') {
    // log.write('on OPTIONS, origin: ' + req.headers.origin);
    // log.write('     request-hdrs: ' + JSON.stringify(req.headers, null, 2));
    // var allowedHeaders = ['Accept', 'Authorization', 'Origin', 'Referer',
    //                       'User-Agent', 'X-Requested-With'];
    var allowedHeaders = ['authorization','accept','origin','content-type','x-requested-with',
                          'x-appsvcs'];

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT');
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Max-Age', '60'); // delta seconds
    res.send(204);
  }
  else if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    next();
  }
  else next();
}

app.configure(function() {
  // app.use(function(req, res, next) {
  //   res.on('header', function() {
  //     console.log('HEADERS GOING TO BE WRITTEN');
  //   });
  //   next();
  // });
  app.use(myCorsHandler);
  app.use(express.bodyParser());
  app.use(express.json());
});

// server.use(restify.bodyParser({ mapParams: false })); // put post payload in req.body
// server.use(restify.queryParser());
// //server.use(restify.CORS());
// server.use(restify.fullResponse()); // I think reqd for CORS success
//
// function unknownMethodHandler(req, res) {
//   // handle CORS
//   if (req.method.toLowerCase() === 'options') {
//     log.write('on OPTIONS, origin: ' + req.headers.origin);
//     //log.write('     request-hdrs: ' + req.headers['Access-Control-Request-Headers']);
//     log.write('     request-hdrs: ' + JSON.stringify(req.headers, null, 2));
//     // var allowedHeaders = ['Accept', 'Authorization', 'Origin', 'Referer',
//     //                       'User-Agent', 'X-Requested-With'];
//     var allowedHeaders = ['Authorization','Content-Type','X-Requested-With'];
//     //if (res.methods.indexOf('OPTIONS') === -1) res.methods.push('OPTIONS');
//
//     res.header('Access-Control-Allow-Credentials', true);
//     res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
//     res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT');
//     res.header('Access-Control-Allow-Origin', req.headers.origin);
//     res.header('Access-Control-Max-Age', '60'); // delta seconds
//     return res.send(204);
//   }
//   return res.send(new restify.MethodNotAllowedError());
// }
//
// server.on('MethodNotAllowed', unknownMethodHandler);


app.post('/token', function(req, res, next) {
  var body = req.body,
      options = getModelOptions(req);
  // could add a logout fn here. Would involve removing token from the tokenHash.
  log.write('POST token');

  if ( !options.uri) {
    log.write('missing org or app');
    res.setHeader('Content-Type', 'application/json');
    res.send(400, JSON.stringify({error:"you must specify an X-Appsvcs header containing org:app"},null,2));
    return;
  }

  q(body)
    .then(function(bdy){
      var deferredPromise = q.defer();
      if ( ! bdy.grant_type) {bdy.grant_type = 'password';}
      options.json = bdy;
      options.method = 'post';
      options.uri += '/token';
      //log.write('requesting ' + JSON.stringify(requestOpts,null,2));
      request(options, function(e, httpResp, body) {
        var orgapp;
        if (e) {
          log.write('error?: ' + e);
          log.write('error?: ' + JSON.stringify(e,null,2));
          deferredPromise.resolve({status: 500,
                                   body:JSON.stringify(e,null,2)});
        }
        else {
          // store org+app for later use with this token
          orgapp = splitOrgappHeader(req.headers['x-appsvcs']);
          tokenHash[body.access_token] = {org:orgapp.org, app:orgapp.app, stamp:(new Date()).getTime(), payload:body};
          deferredPromise.resolve({status: httpResp.statusCode, body:body});
        }
      });
      return deferredPromise.promise;
    })
    .done(function(obj) {
      res.setHeader('Content-Type', 'application/json');
      res.send(obj.status, obj.body);
    });
});


app.get('/users/:userid', function(req, res, next) {
  var options = getModelOptions(req);
  log.write('GET user');
  //console.log('inbound request: ' + req.url + '\n' + dumpRequest(req));
  if ( ! options.uri) {
      res.setHeader('Content-Type', 'application/json');
      res.send(400, {error:'you must specify a valid, known token in the Authorization header'});
      return;
  }
  options.uri += req.url; // pass-through
  request.get(options, function(e, httpResp, body) {
    var obj, responseBody;
    try {
      obj = JSON.parse(body);
    }
    catch (exc1) {
      obj = null;
    }
    logTransaction(e, null, httpResp, obj);
    res.setHeader('Content-Type', 'application/json');
    // var msg = '';
    // Object.keys(httpResp).map(function (elt) {
    //   if (msg !== '') {msg += ',\n';}
    //   msg += elt;
    // });
    // log.write('keys(httpResp): ' + msg);
    if (e || !obj || !obj.entities || !obj.entities[0] || !obj.entities[0].type || obj.entities[0].type !== 'user') {
      responseBody = {status:'error'};
      if (obj.error_description) {
        responseBody.message = obj.error_description;
      }
      res.send(httpResp.statusCode, responseBody);
    }
    else {
      // if (isRefresh) {
      //   tokenHash[extractBearerToken(req.headers['authorization'])] = {
      //     org:h[0], app:h[1] stamp:(new Date()).getTime()
      //   };
      // }
      res.send(obj);
    }
  });
});



app.get('/jobs', function(req, res, next) {
  var options = getModelOptions(req);
  log.write('GET jobs');
  if ( ! options.uri) {
    res.setHeader('Content-Type', 'application/json');
    res.send(400, {error: 'you must specify a valid, known token in the Authorization header'});
    return;
  }
  console.log('options: ' + JSON.stringify(options,null,2));
  q({modelConnection:{authz:req.headers.authorization, orgapp:req.headers['x-appsvcs']}})
    .then(retrieveAllJobs)
    .then(function(ctx) {
      ctx.model.jobs.forEach(function (element, index, array){
        element.status = (activeJobs.hasOwnProperty(element.uuid)) ?
          "running" : "stopped";
      });
      res.json(ctx.model.jobs);
      return true;
    })
    .done();
});


app.del('/jobs/:jobid', function(req, res, next) {
  var jobid = req.params.jobid,
      match = reUuid.exec(req.params.jobid);

  if ( ! match) {
    res.json(400, {status: 'fail', message:'malformed uuid'});
    return;
  }
  log.write('delete job, job id: ' + req.params.jobid);
  q.resolve({jobid:jobid, modelConnection:{authz:req.headers.authorization, orgapp:req.headers['x-appsvcs']}})
    .then(deleteOneJob)
    .then(function(ctx) {
      res.json(ctx.status, ctx);
      return true;
    })
    .done();
});



app.post('/jobs', function(req, res, next) {
  // as of Monday, 23 September 2013, 17:11, there are no known users of this endpoint.
  // As a result this has not been tested.
  var body = req.body;
  log.write('POST jobs');
  q.resolve(body)
    .then(function(bdy){
      var deferredPromise = q.defer(),
          requestOpts = combineProps(getModelOptions(req), { method: 'post', json: bdy});
      requestOpts.uri += '/jobs';
      request(requestOpts, function(e, httpResp, body) {
        var newJob;
        if (e) {
          log.write('error?: ' + JSON.stringify(e,null,2));
          deferredPromise.resolve({status: httpResp.statusCode,
                                   body:JSON.stringify(e,null,2)});
        }
        else {
          newJob = body.entities[0];
          log.write('New job created:' + JSON.stringify(newJob));
          deferredPromise.resolve({status: httpResp.statusCode, body:newJob});
        }
      });
      return deferredPromise.promise;
    })
    .then(function(ctx) {
      res.json(ctx.status, ctx.body);
      return true;
    })
    .done();
});


app.put('/jobs/:jobid', function(req, res, next) {
  var body = req.body,
      jobid = req.params.jobid,
      match = reUuid.exec(req.params.jobid),
      token = extractBearerToken(req.headers.authorization),
      orgapp = (token) ? tokenHash[token] : null;

  if ( ! token) {
    log.write('missing token');
    res.json(400, {status: 'fail', message:'you must pass a bearer token in the Authorization header'});
  }
  else if ( ! orgapp) {
    log.write('invalid token');
    res.json(400, {status: 'fail', message:'you must login before doing that'});
  }
  else if ( ! match) {
    log.write('bad job id');
    res.json(400, {status: 'fail', message:'malformed jobid'});
  }
  else {
    log.write('PUT jobs');
    q.resolve({jobid:jobid, modelConnection:{
      authz:req.headers.authorization,
      orgapp:req.headers['x-appsvcs'],
      body:body}})
      .then(updateOneJob)
      .then(function(ctx) {
        res.json(ctx.status, ctx);
        //next();
        return true;
      })
      .done();
  }
});


app.get('/jobs/:jobid', function(req, res, next) {
  var jobid = req.params.jobid,
      match = reUuid.exec(req.params.jobid),
      token = extractBearerToken(req.headers.authorization),
      orgapp = (token) ? tokenHash[token] : null;

  if ( ! token) {
    log.write('missing token');
    res.json(400, {status: 'fail', message:'you must pass a bearer token in the Authorization header'});
  }
  else if ( ! orgapp) {
    log.write('invalid token');
    res.json(400, {status: 'fail', message:'you must login before doing that'});
  }
  else if ( ! match) {
    log.write('bad job id');
    res.json(400, {status: 'fail', message:'malformed jobid'});
  }
  else {
    log.write('GET job ' + req.params.jobid);
    q.resolve({jobid:jobid, modelConnection:{authz:req.headers.authorization, orgapp:req.headers['x-appsvcs']}})
      .then(retrieveOneJob)
      .then(retrieveSequencesForJob)
      .then(function(ctx) {
        var job = ctx.model.jobs[0];
        job.status = (activeJobs.hasOwnProperty(req.params.jobid)) ? "running" : "stopped";
        res.json(job);
        return true;
      })
      .done();
  }
});



// start and stop jobs
app.post('/jobs/:jobid',
         function(req, res, next) {
           var jobid = req.params.jobid,
               match = reUuid.exec(jobid),
               action = req.query.action,
               timeoutId,
               token = extractBearerToken(req.headers.authorization),
               orgapp = (token) ? tokenHash[token] : null;
           log.write('POST jobs/' + jobid + ' action=' + action);
           // console.log('params: ' + JSON.stringify(req.params, null, 2));
           // console.log('body: ' + JSON.stringify(req.body, null, 2));

           if (!orgapp) {
             orgapp = req.headers['x-appsvcs'];
           }

           if ( ! token) {
             log.write('missing token');
             res.json(400, {status: 'fail', message:'you must pass a bearer token in the Authorization header'});
           }
           else if ( ! orgapp) {
             log.write('no orgapp');
             res.json(400, {status: 'fail', message:'you must specify the org and app'});
           }
           else if ( ! match) {
             log.write('bad job id');
             res.json(400, {status: 'fail', message:'malformed jobid'});
           }
           else {
             if (action == 'start') {
               try {
                 if ( ! activeJobs.hasOwnProperty(jobid)) {
                   q.resolve({jobid:jobid, modelConnection:{authz:req.headers.authorization, orgapp:orgapp}})
                     .then(retrieveOneJob)
                     .then(function(ctx){
                       // this response gets sent just before the job is started
                       if ( ! ctx.model.jobs) {
                         res.json({"status":"fail","message":"no job"});
                       }
                       else {
                         res.json({"status":"ok"});
                       }
                       return ctx;
                     })
                     .then(function(ctx) {
                       log.write('setting initial context');
                       ctx.startContext = copyHash(req.body);
                       ctx.initialExtractContext = combineProps(ctx.model.jobs[0].initialContext,
                                                                ctx.startContext);
                       log.write(JSON.stringify(ctx.initialExtractContext,null,2));
                       return ctx;
                     })
                     .then(initializeJobRunAndKickoff)
                     .done(function(){},
                           function(e){
                             log.write('unhandled error: ' + e);
                             log.write(e.stack);
                           });
                 }
                 else {
                   log.write('cannot start; job is already running');
                   res.json(400, {status: 'fail',message:"that job is already running"});
                 }
               }
               catch (exc1) {
                 log.write('Exception: ' + exc1);
               }
             }
             else if (action == 'stop') {
               if (activeJobs.hasOwnProperty(jobid)) {
                 timeoutId = activeJobs[jobid];
                 // Either the timeoutId is a real timeoutId or it is zero.
                 // The latter indicates the job is "currently running".
                 if (timeoutId) {
                   clearTimeout(timeoutId);
                   delete activeJobs[jobid];
                 }
                 else {
                   // mark for pending stop. This is checked in runJob.
                   pendingStop[jobid] = true;
                 }
                 log.write('stop job ' + jobid);
                 res.json({status:"ok"});
               }
               else {
                 log.write('cannot stop; job is not running');
                 res.json(400, {status: 'fail', message:"that job is not currently running"});
               }
             }
             else {
               log.write('invalid action');
               res.json(400, {status: 'fail', message:'invalid action'});
             }
           }
         });


// ------------------------------------------------------------------
server = http.createServer(app);

server.listen(process.env.PORT || 8001, function() {
  log.write('=======================================================');
  log.write('loadgen server start, listening: ' + server.address().port);
});
