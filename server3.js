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
// last saved: <2013-July-23 16:09:18>
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
    log = bunyan.createLogger({
      name: 'my_restify_application',
      level: process.env.LOG_LEVEL || 'info',
      stream: process.stdout,
      serializers: bunyan.stdSerializers
    }),
    server = restify.createServer({
      log: log,
      name: 'my_restify_application'
    }),
    activeJobs = {},
    fiveMinutesInMs = 5 * 60 * 1000,
    modelSourceUrlPrefix = '/dino/loadgen1',
    reUuidStr = '[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}',
    reUuid = new RegExp(reUuidStr),
    mClient = restify.createJsonClient({
      url: 'https://api.usergrid.com/',
      headers: {
        'Accept' : 'application/json'
      }
    });

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
  if (res && res.statusCode) {
    console.log('\nresponse status: ' + res.statusCode);
  }
  console.log('response body: ' + JSON.stringify(obj, null, 2) +'\n\n');
  //assert.ifError(e);
}


function retrieveAllJobs() {
  var deferredPromise = q.defer();
  console.log('===========================================\nRetrieve Jobs');
  mClient.get(modelSourceUrlPrefix + '/jobs', function(e, httpReq, httpResp, obj) {
    //logTransaction(e, httpReq, httpResp, obj);
    deferredPromise.resolve({
      state: {job:0, stage:'retrieve'},
      model: {jobs:obj.entities}
    });
  });
  return deferredPromise.promise;
}

function retrieveOneJob(ctx) {
  var deferredPromise = q.defer();
  console.log('===========================================\nRetrieve one Job: ' +ctx.jobid);
  mClient.get(modelSourceUrlPrefix + '/jobs/' + ctx.jobid, function(e, httpReq, httpResp, obj) {
    logTransaction(e, httpReq, httpResp, obj);
    deferredPromise.resolve({
      state: {job:0, stage:'retrieve', jobid:ctx.jobid},
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
      //logTransaction(e, httpReq, httpResp, obj);
      s.requests = obj.entities;
      state.currentSequence++;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence);

  }(ctx));
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
    console.log('========================================\nretrieveSequencesForEachJob');
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

// ==================================================================

function trackFailure(e) {
  console.log('failure: ' + e);
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
    //console.log('evaluating: ' + src);
    f = eval(src);
    result = f.apply(null, values);
    //console.log('result: ' + result);
  }
  catch (exc1) {
    r = null;
  }
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
        method = req.method.toLowerCase(),
        respHandler = function(e, httpReq, httpResp, obj) {
          var i, L, ex;
          logTransaction(e, httpReq, httpResp, obj);
          // perform any extraction required for the request
          if (req.extracts && req.extracts.length>0) {
            // cache the extract functions
            //if ( ! ctx.state.extracts) { ctx.state.extracts = {}; }
            for (i=0, L=req.extracts.length; i<L; i++) {
              ex = req.extracts[i];
              if ( ! ex.compiledFn) {
                console.log('eval: ' + ex.fn);
                ex.compiledFn = eval('(' + ex.fn + ')');
              }
              console.log(ex.description);
              // actually invoke the compiled fn
              try {
                ctx.state.extracts[ex.valueRef] = ex.compiledFn(obj);
              }
              catch (exc1) {
                ctx.state.extracts[ex.valueRef] = null;
              }
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

    if (method === "post") {
      console.log('post ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.post(suffix, actualPayload, respHandler);
    }
    else if (method === "put") {
      console.log('put ' + suffix);
      actualPayload = expandEmbeddedTemplates(ctx, req.payload);
      client.put(suffix, actualPayload, respHandler);
    }
    else if (method === "get") {
      console.log('get ' + suffix);
      client.get(suffix, respHandler);
    }
    else {
      assert.fail(r.method,"get|post|put", "unsupported method", "<>");
    }
    return deferredPromise.promise;
  });

  // reset the headerInjector
  p = p.then(function(ctx) { ctx.state.headerInjector = noop; return ctx;});

  return p;
}


function runJob(context) {
  var state = context.state,
      model = context.model,
      job = model.jobs[0],
      p, sequence;

  console.log('++++++++++++++++++++++++++++++++++++++++++++ runJob ');

  // check for termination.
  // This is an unrolled version of a 4-level-deep nested loop
  if (state.request === state.R) {
    state.request = 0;
    state.iteration++;
    console.log('+++++++ next Iteration');
    return q.resolve(context).then(runJob);
  }
  if (state.iteration === state.I[state.sequence]) {
    state.iteration = 0;
    state.sequence++;
    console.log('+++++++ next Sequence');
    return q.resolve(context).then(runJob, trackFailure);
  }
  if (state.sequence === state.S) {
    // terminate
    state.sequence = 0;
    return q.resolve(context).then(setWakeup);
  }
  else {
    // reset counts and fall through
    state.S = job.sequences.length;
    state.R = job.sequences[state.sequence].requests.length;
    if ( ! state.I[state.sequence]) {
      state.I[state.sequence] = resolveNumeric(job.sequences[state.sequence].iterations);
    }
    console.log('R ' + (state.request + 1) + '/' + state.R +
                ' I ' + (state.iteration + 1) + '/' + state.I[state.sequence] +
                ' S ' + (state.sequence + 1) + '/' + state.S);
  }

  // if we arrive here we're doing a request, implies an async call
  p = q.resolve(context).then(invokeOneRequest);

  // sleep if necessary
  sequence = job.sequences[state.sequence];
  if (state.request === 0 && state.iteration !== 0) {
    if (sequence.delayBetweenIterations) {
      p = p.then(function(c) {
        sleep.usleep(resolveNumeric(sequence.delayBetweenIterations) * 1000);
        return c; // for chaining
      });
    }
  }
  return p.then(runJob);
}


function initializeJobRunAndKickoff(context) {
  // initialize context for running
  context.state = {
    state:'run',
    job: 0,
    sequence : 0,
    S : context.model.jobs[0].sequences.length,
    request : 0,
    R : context.model.jobs[0].sequences[0].requests.length,
    iteration : 0,
    I : [],
    extracts: context.initialExtractContext,
    start : (new Date()).valueOf()
  };

  return q.resolve(context)
    .then(runJob);
}


function setWakeup(context) {
  var jobid = context.model.jobs[0].uuid,
      initialExContext = context.initialExtractContext,
      fiveMinutesAfterPriorStart = context.start + fiveMinutesInMs,
      currentTime = (new Date()).valueOf(),
      sleepTimeInMs = fiveMinutesAfterPriorStart - currentTime;
  // validate the sleep time
  if (sleepTimeInMs < 30000) { sleepTimeInMs = 30000; }
  console.log('setWakeup in ' + sleepTimeInMs + 'ms, starting at '+ (new Date()).toString());
  activeJobs[jobid] =
    setTimeout(function () {
      var startMoment = new Date().valueOf();
      q.resolve({jobid:jobid})
        .then(retrieveOneJob)
        .then(retrieveSequencesForEachJob)
        .then(function(ctx) {
          ctx.initialExtractContext = initialExContext;
          ctx.start = startMoment;
          return ctx;
        })
        .then(initializeJobRunAndKickoff);
    }, sleepTimeInMs);
  return context;
}


// ******************************************************************

server.use(restify.bodyParser({ mapParams: false })); // put post payload in req.body
server.use(restify.queryParser());

// server.post(new RegExp('^/(jobs|sequences|requests)$'), function(req, res, next) {
//   // TODO: implement creation of new items
//   res.send(201, {
//     collection: req.params[0],
//     id: Math.random().toString(36).substr(3, 8)
//   });
//   return next();
// });
//
// server.get(new RegExp('^/(jobs|sequences|requests)$'), function(req, res, next) {
//   if (req.params[0] === 'jobs') {
//     q
//       .fcall(retrieveAllJobs)
//       .then(retrieveSequencesForEachJob)
//       .then(function(ctx) {
//         res.send(ctx.model.jobs);
//         next();
//         return true;
//       })
//       .done();
//   }
//   else {
//     mClient.get(modelSourceUrlPrefix + '/' + req.params[0], function(e, httpReq, httpResp, obj) {
//       //logTransaction(e, httpReq, httpResp, obj);
//       res.send(obj.entities);
//       return next();
//     });
//   }
// });
//
// server.get(new RegExp('^/(jobs)/([^/]+)$'), function(req, res, next) {
//   var match = reUuid.exec(req.params[1]);
//   if (match) {
//     console.log('get job, job id: ' + req.params[1]);
//     q.resolve({jobid:req.params[1]})
//       .then(retrieveOneJob)
//       .then(retrieveSequencesForEachJob)
//       .then(function(ctx) {
//         res.send(ctx.model.jobs[0]);
//         next();
//         return true;
//       })
//       .done();
//   }
//   else {
//     res.send(400, {msg:'malformed uuid'});
//     return next();
//   }
// });

server.post('/jobs/:jobid?action=:action', // RegExp here failed for me.
            function(req, res, next) {
              var jobid = req.params.jobid,
                  match = reUuid.exec(jobid),
                  action = req.params.action,
                  timeoutId;
              // console.log('params: ' + JSON.stringify(req.params, null, 2));
              // console.log('body: ' + JSON.stringify(req.body, null, 2));

              if (match) {
                if (action == 'start') {
                  if ( ! activeJobs.hasOwnProperty(jobid)) {
                  q.resolve({jobid:jobid})
                    .then(retrieveOneJob)
                    .then(retrieveSequencesForEachJob)
                    .then(function(ctx) {
                      ctx.initialExtractContext = req.body;
                      return ctx;
                    })
                    .then(initializeJobRunAndKickoff)
                    .then(function(ctx) {
                      return true;
                    })
                    .done();

                    // this response gets sent while the job is running
                    res.send({"message":"ok"});
                    next();
                  }
                  else {
                    res.send(400, {"message":"that job is already  running"});
                    return next();
                  }
                }
                else if (action == 'stop') {
                  if (activeJobs.hasOwnProperty(jobid)) {
                    timeoutId = activeJobs[jobid];
                    clearTimeout(timeoutId);
                    delete activeJobs[jobid];
                    console.log('stop job ' + jobid);
                    res.send({"message":"ok"});
                    return next();
                  }
                  else {
                    res.send(400, {"message":"that job is not currently running"});
                    return next();
                  }
                }
                else {
                  res.send(400, {msg:'invalid action'});
                  return next();
                }
              }
              else {
                res.send(400, {msg:'malformed jobid'});
                return next();
              }
            });


// ** This isn't going to work because of the security on the /sequences
// ** and /requests collections
//
// server.get(new RegExp('^/(jobs|sequences|requests)/([^/]+)$'), function(req, res, next) {
//   var match = reUuid.exec(req.params[1]);
//   console.log('looking at: ' + req.params[1]);
//   if (match) {
//     console.log('getting ' + req.url);
//     mClient.get(modelSourceUrlPrefix + req.url, function(e, httpReq, httpResp, obj) {
//       logTransaction(e, httpReq, httpResp, obj);
//       res.send(obj.entities[0]);
//       return next();
//     });
//   }
//   else {
//     res.send(400, {msg:'malformed uuid'});
//     return next();
//   }
// });

server.get(new RegExp('^/jobs/('+reUuidStr+')/includes$'), function(req, res, next) {
  console.log('looking at: ' + req.params[0]);
  var match = reUuid.exec(req.params[0]);
  if (match) {
    mClient.get(modelSourceUrlPrefix + '/jobs/' + req.params[0] + '/includes', function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      if (obj){
        res.send(obj.entities);
      }
      return next();
    });
  }
  else {
    res.send(400, {msg:'malformed uuid'});
    return next();
  }
});


server.get(new RegExp('^/jobs/('+reUuidStr+')/includes/('+reUuidStr+')/references$'), function(req, res, next) {
  var match0 = reUuid.exec(req.params[0]),
      match1 = reUuid.exec(req.params[1]);

  if (match0 && match1) {
    mClient.get(modelSourceUrlPrefix + req.url, function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      if (obj){
        res.send(obj.entities);
      }
      return next();
    });
  }
  else {
    res.send(400, {msg:'malformed uuid'});
    return next();
  }
});

// ------------------------------------------------------------------

server.listen(8001, function() {
  console.log('listening: %s', server.url);
});
