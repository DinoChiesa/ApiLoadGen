// server3.js
// ------------------------------------------------------------------
//
// Job control server implemented using restify.
//
//   GET /jobs
//   POST /jobs
//   GET /jobs/{job-id}/includes
//   GET /jobs/{job-id}/includes/{sequence-id}
//   GET /jobs/{job-id}/includes/{sequence-id}/references
//   POST /jobs/{job-id}?action=start
//   POST /jobs/{job-id}?action=stop
//   etc
//
// You may have to do the following to run this code:
//
//    npm install restify
//
//
// created: Mon Jul 22 03:34:01 2013
// last saved: <2013-August-02 08:57:06>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------


var restify = require('restify'),
    assert = require('assert'),
    bunyan = require('bunyan'),
    q = require ('q'),
    sleep = require('sleep'),
    log = new Log(), 
    server = restify.createServer(),
    activeJobs = {}, pendingStop = {}, 
    oneHourInMs = 60 * 60 * 1000,
    fiveMinutesInMs = 5 * 60 * 1000,
    minSleepTimeInMs = 18000, 
    defaultRunsPerHour = 60, 
    modelSourceUrlPrefix = '/dino/loadgen1',
    reUuidStr = '[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}',
    reUuid = new RegExp(reUuidStr);

function Log(id) { }

Log.prototype.write = function(str) {
  var time = (new Date()).toString(), me = this;
  console.log('[' + time.substr(11, 4) + '-' +
              time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
              time.substr(16, 8) + '] ' + str );
};


function getModelClient(param) {
  var authz, client, hdrs = {
    'Accept' : 'application/json'
  };

  // This fn can be called with either an inbound request, or with a context.  The
  // context contains a child 'modelConnection' while the inbound request contains a child
  // called 'headers'.
  if (param) {
    if (param.modelConnection) {
      hdrs.authorization = param.modelConnection.authz;
    }
    else if (param.headers) {
      authz = param.headers.authorization || param.headers.Authorization;
      if (authz) {
        hdrs.authorization = authz;
      }
    }
  }

  client = restify.createJsonClient({
    url: 'https://api.usergrid.com/',
    headers: hdrs
  });

  return client;
}


function noop() {}

// function getUuidFinder(uuid) {
//   return function (elt, ix, a) {
//     return (elt.uuid === uuid);
//   };
// }

function copyHash(obj) {
    if (null === obj || "object" != typeof obj) {return obj;}
    var copy = {};
    for (var attr in obj) {
        if (obj.hasOwnProperty(attr)) {copy[attr] = obj[attr];}
    }
    return copy;
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


function logTransaction(e, req, res, obj, payload) {
  console.log('\n' + req.method + ' ' + req.path);
  console.log('headers: ' + JSON.stringify(req._headers, null, 2));
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
      // I am getting an ECONNRESET on the restify client after a long period of running. 
      // In an attempt to avoid that, I'm not re-using the old client. 
      //client = ctx.modelConnection.client || getModelClient(ctx);
      client = getModelClient(ctx);

  log.write('retrieveAllJobs');
  client.get(modelSourceUrlPrefix + '/jobs', function(e, httpReq, httpResp, obj) {
    //logTransaction(e, httpReq, httpResp, obj);
    if (e) {
      deferredPromise.resolve({
        state: {job:0, stage:'retrieve', error:e},
        model: {jobs:{}}, 
        modelConnection: {authz:ctx.modelConnection.authz}
      });
    }
    else {
      deferredPromise.resolve({
        state: {job:0, stage:'retrieve'},
        model: {jobs:obj.entities}, 
        modelConnection: {client:client, authz:ctx.modelConnection.authz}
      });
    }
  });
  return deferredPromise.promise;
}


function retrieveOneJob(ctx) {
  var deferredPromise = q.defer(), 
      // I am getting an ECONNRESET on the restify client after a long period of running. 
      // In an attempt to avoid that, I'm not re-using the old client. 
      //client = ctx.modelConnection.client || getModelClient(ctx);
      client = getModelClient(ctx);

  log.write(ctx.jobid + ' retrieveOneJob');
  client.get(modelSourceUrlPrefix + '/jobs/' + ctx.jobid, function(e, httpReq, httpResp, obj) {
    //logTransaction(e, httpReq, httpResp, obj);
    if (e) {
      console.log('error: ' + JSON.stringify(e, null, 2));
      deferredPromise.resolve({
        state: {job:0, stage:'nojob', jobid:ctx.jobid, error:e},
        model: {}, 
        modelConnection: { authz: ctx.modelConnection.authz }
        // Leave modelConnection.client undefined.
        // It will be re-initialized next time through. 
      });
    }
    else if (obj.entities && obj.entities[0]) {
      deferredPromise.resolve({
        state: {job:0, stage:'retrieve', jobid:ctx.jobid},
        model: {jobs:obj.entities}, 
        modelConnection: {authz: ctx.modelConnection.authz, client: client}
      });
    }
    else {
      console.log('non response? ' + JSON.stringify(obj, null, 2));
      deferredPromise.resolve({
        state: {job:0, stage:'nojob', jobid:ctx.jobid},
        model: {}, 
        modelConnection: { authz: ctx.modelConnection.authz }
      });
    }
  });
  return deferredPromise.promise;
}


function retrieveRequestsForOneSequence(ctx) {
  return (function (context) {
    var deferred, s, url,
        state = context.state,
        model = context.model, 
        client = context.modelConnection.client;

    // check for termination
    if (state.currentSequence == model.jobs[state.job].sequences.length) {
      state.job++;
      return q.resolve(context);
    }

    deferred = q.defer();
    s = model.jobs[state.job].sequences[state.currentSequence];
    url = modelSourceUrlPrefix + s.metadata.connections.references;

    log.write('retrieveRequestsForOneSequence');
    client.get(url, function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      s.requests = obj.entities;
      state.currentSequence++;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence);

  }(ctx));
}


function retrieveLoadProfileForJob(ctx) {
  return (function (context) {
    var deferred,
        client = context.modelConnection.client, 
        model = context.model,
        jobs = model.jobs,
        job = jobs ? jobs[0] : null,
        query = "select * where type = 'loadprofile'",
        url;

    log.write('retrieveLoadProfileForJob');

    if ( ! job) {
      return q.resolve(context);
    }

    deferred = q.defer();
    url = modelSourceUrlPrefix +
      job.metadata.connections.uses + '?ql=' + encodeURIComponent(query);

    client.get(url, function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      if (obj.entities && obj.entities[0]) {
        context.model.jobs[0].loadprofile = obj.entities[0].perHourCounts;
      }
      deferred.resolve(context);
    });

    return deferred.promise;

  }(ctx));
}



function retrieveSequencesForJob(ctx) {
  return (function (context) {
    var deferred,
        client = context.modelConnection.client, 
        query = "select * where type = 'sequence'",
        state = context.state,
        model = context.model,
        jobs = model.jobs,
        j, url;

    // check for termination
    if ((typeof model.jobs == "undefined") || (state.job == model.jobs.length)) {
      log.write("retrieveSequencesForJob: terminate");
      return q.resolve(context);
    }

    deferred = q.defer();
    log.write('retrieveSequencesForJob');
    j = jobs[state.job];

    url = modelSourceUrlPrefix +
      j.metadata.connections.includes + '?ql=' + encodeURIComponent(query);

    client.get(url, function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      if (e) {
        log.write('error: ' + JSON.stringify(e, null, 2));
        j.sequences = [];
      }
      else {
        j.sequences = obj.entities;
      }
      context.state.currentSequence = 0;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence) // increments state.job
      .then(retrieveSequencesForJob);

  }(ctx));
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
// template as appropriate.
function expandEmbeddedTemplates(ctx, obj) {
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

  log.write(job.uuid + ' invokeOneRequest');

  // 1. initialize the restclient as necessary
  if (state.job === 0 && state.request === 0 && state.sequence === 0 && state.iteration === 0) {
    // initialize restify client
    state.headerInjector = noop;
    state.restClient = restify.createJsonClient({
      url: job.defaultProperties.scheme + '://' + job.defaultProperties.host,
      headers: job.defaultProperties.headers,
      signRequest : function(r) { return state.headerInjector(r);}
    });
  }
  client = state.restClient;

  // 2. delay as appropriate
  if (req.delayBefore) {
    p = p.then(function(ctx){
      sleep.usleep(req.delayBefore * 1000);
      return ctx;
    });
  }

  // 3. evaluate the pathsuffix if required. 
  if (match) {
    // The pathsuffix includes a replacement string.
    // Must evaluate the replacement within the promise chain.
    p = p.then(function(ctx){
      suffix = match[1] + evalTemplate(ctx, match[2]) + match[3];
      return ctx;
    });
  }

  // 4. conditionally set the header injector to inject any custom headers for
  // this request. 
  if (req.headers) {
    // set a new headerInjector for our purpose
    p = p.then(function(ctx) {
      ctx.state.headerInjector = function (clientRequest) {
        // The header is mutable using the setHeader(name, value),
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
            //log.write('setHeader(' + hdr + ',' + value + ')');
            clientRequest.setHeader(hdr, value);
          }
        }
      };
      return ctx;
    });
  }

  // 5. actually do the http call, and the subsequent extracts
  p = p.then(function(ctx) {
    var deferredPromise = q.defer(),
        method = (req.method)? req.method.toLowerCase() : "get", 
        respHandler = function(e, httpReq, httpResp, obj) {
          var i, L, ex;
          //logTransaction(e, httpReq, httpResp, obj);
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
                ctx.state.extracts[ex.valueRef] = ex.compiledFn(obj);
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

    if (method === "post") {
      log.write('post ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.post(suffix, actualPayload, respHandler);
    }
    else if (method === "put") {
      log.write('put ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.put(suffix, actualPayload, respHandler);
    }
    else if (method === "get") {
      log.write('get ' + suffix);
      client.get(suffix, respHandler);
    }
    else if (method === "delete") {
      log.write('delete ' + suffix);
      client.delete(suffix, respHandler);
    }
    else {
      assert.fail(r.method,"get|post|put|delete", "unsupported method", "<>");
    }
    return deferredPromise.promise;
  });

  // 6. conditionally reset the headerInjector
  if (req.headers) {
    p = p.then(function(ctx) {     
      ctx.state.headerInjector = noop; 
      return ctx;
    });
  }

  return p;
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
  if (state.iteration === state.I[state.sequence]) {
    state.iteration = 0;
    state.sequence++;
    log.write('++ Sequence');
    return q.resolve(context).then(runJob, trackFailure);
  }
  if (state.sequence === state.S) {
    // terminate
    state.sequence = 0;
    return q.resolve(context).then(setWakeup, trackFailure);
  }

  // need to verify that all properties are valid. 
  // Sometimes they are not due to intermittent data retrieval errors. 
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
  p = q.resolve(context).then(invokeOneRequest, trackFailure);

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
  var now = (new Date()).valueOf();
  log.write("initializeJobRunAndKickoff");
  // initialize context for running
  if ( ! context.model.jobs) {
    log.write("-no job-");
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
        return q.resolve(context); 
      }
      // else, get a new client next time, and attempt to recover.
      delete context.modelConnection.client;
      return q.resolve(context).then(setWakeup); 
    }
    return q.resolve(context).then(setWakeup); 
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

  return q.resolve(context).then(runJob);
}


// setWakeup - schedule the next wakeup for a job, after it has completed. 
function setWakeup(context) {
  var jobid,
      initialExContext = context.initialExtractContext,
      now = new Date(),
      currentHour = now.getHours(),
      durationOfLastRun = now - context.state.start,
      runsPerHour, sleepTimeInMs;

  if (context.model.jobs && context.model.jobs[0]) {
    jobid = context.model.jobs[0].uuid;
  }
  else if (context.state.jobid) {
    jobid = context.state.jobid;
  }
  else {
    jobid = "xxx";
    log.write("context: " + JSON.stringify(context, null, 2));
  }
  log.write(jobid + ' setWakeup');

  // compute and validate the sleep time
  if (currentHour < 0 || currentHour > 23) { currentHour = 0;}
  runsPerHour = (context.model.jobs &&
                 context.model.jobs[0].loadprofile &&
                 context.model.jobs[0].loadprofile[currentHour]) ?
    context.model.jobs[0].loadprofile[currentHour] : defaultRunsPerHour;

  sleepTimeInMs =
    Math.floor(oneHourInMs / runsPerHour) - durationOfLastRun;

  if (sleepTimeInMs < minSleepTimeInMs) { sleepTimeInMs = minSleepTimeInMs; }

  log.write(jobid + ' ' + runsPerHour + ' runs per hour');
  log.write(jobid + ' sleep ' + sleepTimeInMs + 'ms, wake at ' +  new Date(now.valueOf() + sleepTimeInMs).toString().substr(16, 8));


  activeJobs[jobid] =
    setTimeout(function () {
      var startMoment = new Date().valueOf();
      // // diagnose intermittent ECONNRESET errors when contacting App Services
      // if (context.modelConnection) {
      //   console.log('modelConnection: { authz: ' + context.modelConnection.authz + ',\n' +
      //             '  client: ' + context.modelConnection.client.toString() + '}');
      // }
      // else {
      //   console.log('NO modelConnection?');
      // }
      activeJobs[jobid] = 0; // mark this job as "running" (not waiting)
      log.write(jobid + ' awake');
      q.resolve({jobid:jobid, modelConnection: context.modelConnection})
        .then(retrieveOneJob)
        .then(retrieveLoadProfileForJob)
        .then(retrieveSequencesForJob)
        .then(function(ctx) {
          log.write('setting initial extract context');
          ctx.initialExtractContext = initialExContext;
          ctx.state.start = startMoment;
          return ctx;
        })
        .then(initializeJobRunAndKickoff)
        .done(function(){}, 
              function(e){log.write('unhandled error: ' + e);});
    }, sleepTimeInMs);
  return context;
}


// ******************************************************************

server.use(restify.bodyParser({ mapParams: false })); // put post payload in req.body
server.use(restify.queryParser());
//server.use(restify.CORS());
server.use(restify.fullResponse()); // I think reqd for CORS success

function unknownMethodHandler(req, res) {
  // handle CORS
  if (req.method.toLowerCase() === 'options') {
    log.write('on OPTIONS, origin: ' + req.headers.origin);
    //log.write('     request-hdrs: ' + req.headers['Access-Control-Request-Headers']);
    log.write('     request-hdrs: ' + JSON.stringify(req.headers, null, 2));
    // var allowedHeaders = ['Accept', 'Authorization', 'Origin', 'Referer', 
    //                       'User-Agent', 'X-Requested-With'];
    var allowedHeaders = ['Authorization','Content-Type','X-Requested-With'];
    //if (res.methods.indexOf('OPTIONS') === -1) res.methods.push('OPTIONS');

    res.header('Access-Control-Allow-Credentials', true);
    res.header('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT');
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Max-Age', '60'); // delta seconds
    return res.send(204);
  }
  return res.send(new restify.MethodNotAllowedError());
}

server.on('MethodNotAllowed', unknownMethodHandler);

// server.post('/jobs'), function(req, res, next) {
//   // TODO: implement creation of new jobs
//   res.send(201, {
//     collection: req.params[0],
//     id: Math.random().toString(36).substr(3, 8)
//   });
//   return next();
// });
//

server.get('/users/:userid', function(req, res, next) {
  var client = getModelClient(req);
  console.log('inbound request: ' + req.url + '\n' + dumpRequest(req));
  log.write('outbound GET ' + req.url);
  client.get(modelSourceUrlPrefix + req.url, function(e, httpReq, httpResp, obj) {
    logTransaction(e, httpReq, httpResp, obj);
    if (e || !obj.entities) {
      res.send(httpResp.statusCode || 500, {status:'error'});
    }
    else {
      res.send(obj);
    }
    return next();
  });
});

server.get('/jobs/:jobid', function(req, res, next) {
  var jobid = req.params.jobid,
      match = reUuid.exec(req.params.jobid);

  if (match) {
    log.write('get job, job id: ' + req.params.jobid);
    q.resolve({jobid:req.params.jobid, modelConnection:{authz:req.headers.authorization}})
      .then(retrieveOneJob)
      .then(retrieveSequencesForJob)
      .then(function(ctx) {
        var job = ctx.model.jobs[0];
        job.status = (activeJobs.hasOwnProperty(req.params.jobid)) ? "running" : "stopped";
        res.send(job);
        next();
        return true;
      })
      .done();
  }
  else {
    res.send(400, {status:"fail", message:'malformed uuid'});
    return next();
  }
});

server.get('/jobs', function(req, res, next) {
  log.write('GET jobs');
  console.log('inbound request: ' + req.url + '\n' + dumpRequest(req));
  q.resolve({modelConnection:{authz:req.headers.authorization}})
    .then(retrieveAllJobs)
    .then(retrieveSequencesForJob)
    .then(function(ctx) {
      ctx.model.jobs.forEach(function (element, index, array){
        element.status = (activeJobs.hasOwnProperty(element.uuid)) ? 
          "running" : "stopped";
      });
      res.send(ctx.model.jobs);
      next();
      return true;
    })
    .done();
});

// start and stop jobs
server.post('/jobs/:jobid?action=:action', // RegExp here failed for me.
            function(req, res, next) {
              var jobid = req.params.jobid,
                  match = reUuid.exec(jobid),
                  action = req.params.action,
                  timeoutId;
              log.write('POST jobs/' + jobid + ' action=' + action);
              // console.log('params: ' + JSON.stringify(req.params, null, 2));
              // console.log('body: ' + JSON.stringify(req.body, null, 2));

              if (match) {
                if (action == 'start') {
                  try {

                    if ( ! activeJobs.hasOwnProperty(jobid)) {
                      q.resolve({jobid:jobid, modelConnection:{authz:req.headers.authorization}})
                        .then(retrieveOneJob)
                        .then(function(ctx){
                          // this response gets sent while the job is running
                          if ( ! ctx.model.jobs) {
                            res.send({"status":"fail","message":"no job"});
                          }
                          else {
                            res.send({"status":"ok"});
                          }
                          // we have retrieved the job, so return to caller. 
                          next();
                          return ctx;
                        })
                        .then(retrieveLoadProfileForJob)
                        .then(retrieveSequencesForJob)
                        .then(function(ctx) {
                          log.write('setting initial context');
                          ctx.initialExtractContext = req.body;
                          return ctx;
                        })
                        .then(initializeJobRunAndKickoff)
                        .done(function(){}, 
                              function(e){log.write('unhandled error: ' + e);});
                    }
                    else {
                      res.send(400, {status:"fail",message:"that job is already  running"});
                      return next();
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
                    res.send({status:"ok"});
                    return next();
                  }
                  else {
                    res.send(400, {status:"fail", message:"that job is not currently running"});
                    return next();
                  }
                }
                else {
                  res.send(400, {status:"fail", message:'invalid action'});
                  return next();
                }
              }
              else {
                res.send(400, {status:"fail", message:'malformed jobid'});
                return next();
              }
            });

// ------------------------------------------------------------------

server.listen(8001, function() {
  log.write('=======================================================');
  log.write('loadgen server start, listening: ' + server.url);
});
