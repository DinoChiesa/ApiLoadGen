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
// last saved: <2013-July-25 06:57:24>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------


var restify = require('restify'),
    assert = require('assert'),
    bunyan = require('bunyan'),
    log = new Log(), 
    q = require ('q'),
    sleep = require('sleep'),
    // bunyanLog = bunyan.createLogger({
    //   name: 'my_restify_application',
    //   level: process.env.LOG_LEVEL || 'info',
    //   stream: process.stdout,
    //   serializers: bunyan.stdSerializers
    // }),
    // server = restify.createServer({
    //   log: bunyanLog,
    //   name: 'my_restify_application'
    // }),
    server = restify.createServer(),
    activeJobs = {},
    oneHourInMs = 60 * 60 * 1000,
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

  function Log(id) { }

  Log.prototype.write = function(str) {
    var time = (new Date()).toString(), me = this;
    console.log('[' + time.substr(11, 4) + '-' +
      time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
      time.substr(16, 8) + '] ' + str );
  };


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
}


function retrieveAllJobs() {
  var deferredPromise = q.defer();
  log.write('retrieveAllJobs');
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
  log.write('retrieveOneJob(' +ctx.jobid + ')');
  mClient.get(modelSourceUrlPrefix + '/jobs/' + ctx.jobid, function(e, httpReq, httpResp, obj) {
    logTransaction(e, httpReq, httpResp, obj);
    if (e) {
      deferredPromise.resolve({
        state: {job:0, stage:'nojob', jobid:ctx.jobid, error:e},
        model: {}
      });
    }
    else if (obj.entities && obj.entities[0]) {
      deferredPromise.resolve({
        state: {job:0, stage:'retrieve', jobid:ctx.jobid},
        model: {jobs:obj.entities}
      });
    }
    else {
      deferredPromise.resolve({
        state: {job:0, stage:'nojob', jobid:ctx.jobid},
        model: {}
      });
    }
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

    log.write('retrieveRequestsForOneSequence');
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


function retrieveLoadProfileForJob(ctx) {
  return (function (context) {
    var deferred,
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

    mClient.get(url, function(e, httpReq, httpResp, obj) {
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

    mClient.get(url, function(e, httpReq, httpResp, obj) {
      //logTransaction(e, httpReq, httpResp, obj);
      j.sequences = obj.entities;
      context.state.currentSequence = 0;
      deferred.resolve(context);
    });

    return deferred.promise
      .then(retrieveRequestsForOneSequence)
      .then(retrieveSequencesForJob);

  }(ctx));
}

// ==================================================================

function trackFailure(e) {
  log.write('failure: ' + e);
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

  log.write('invokeOneRequest');

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
          //logTransaction(e, httpReq, httpResp, obj);
          if (e) {
            log.write(e);
          }
          else if (req.extracts && req.extracts.length>0) {
            // cache the extract functions
            //if ( ! ctx.state.extracts) { ctx.state.extracts = {}; }
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
              }
              catch (exc1) {
                ctx.state.extracts[ex.valueRef] = null;
              }
              // console.log('extractContext: ' +
              //             JSON.stringify(ctx.state.extracts[state.job], null, 2));
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

  // check for termination.
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
    return q.resolve(context).then(setWakeup);
  }
  else {
    // reset counts and fall through
    state.S = job.sequences.length;
    state.R = job.sequences[state.sequence].requests.length;
    if ( ! state.I[state.sequence]) {
      state.I[state.sequence] = resolveNumeric(job.sequences[state.sequence].iterations);
    }
    log.write('R ' + (state.request + 1) + '/' + state.R +
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
  var now = (new Date()).valueOf();
  // initialize context for running
  if ( ! context.model.jobs) {
    console.log("-no job-");
    context.state.sequence = 0;
    context.state.start = now;
    return q.resolve(context); // nothing more to do
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
    extracts: context.initialExtractContext,
    start : now
  };

  return q.resolve(context)
    .then(runJob);
}


function setWakeup(context) {
  var jobid,
      initialExContext = context.initialExtractContext,
      now = new Date(),
      currentHour = now.getHours(),
      durationOfLastRun = now - context.state.start,
      requestsPerHour, sleepTimeInMs;

  log.write('setWakeup');

  if (context.model.jobs && context.model.jobs[0]) {
    jobid = context.model.jobs[0].uuid;
  }
  else if (context.state.uuid) {
    jobid = context.state.uuid;
  }
  else {
    jobid = "xxx";
    log.write("context: " + JSON.stringify(context, null, 2));
  }

  // compute and validate the sleep time
  if (currentHour < 0 || currentHour > 23) { currentHour = 0;}
  requestsPerHour = (context.model.jobs &&
                     context.model.jobs[0].loadprofile &&
                     context.model.jobs[0].loadprofile[currentHour]) ?
    context.model.jobs[0].loadprofile[currentHour] : 12; // default

  sleepTimeInMs =
    Math.floor(oneHourInMs / requestsPerHour) - durationOfLastRun;

  if (sleepTimeInMs < 30000) { sleepTimeInMs = 30000; }

  log.write('doing ' + requestsPerHour + ' requests per hour');
  log.write('sleep for ' + sleepTimeInMs + 'ms');
  //log.write('start at ' + now.toString());
  log.write('will wake at ' +  new Date(now.valueOf() + sleepTimeInMs).toString().substr(16, 8));

  activeJobs[jobid] =
    setTimeout(function () {
      var startMoment = new Date().valueOf();
      q.resolve({jobid:jobid})
        .then(retrieveOneJob)
        .then(retrieveLoadProfileForJob)
        .then(retrieveSequencesForJob)
        .then(function(ctx) {
          log.write('setting initial extract context');
          ctx.initialExtractContext = initialExContext;
          ctx.state.start = startMoment;
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

server.get('/jobs/:jobid', function(req, res, next) {
  var jobid = req.params.jobid,
      match = reUuid.exec(req.params.jobid);
  if (match) {
    log.write('get job, job id: ' + req.params.jobid);
    q.resolve({jobid:req.params.jobid})
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
                      .then(function(ctx){
                        // this response gets sent while the job is running
                        if ( ! ctx.model.jobs) {
                          res.send({"status":"fail","message":"no job"});
                        }
                        else {
                          res.send({"status":"ok"});
                        }
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
                      .then(function(ctx) {
                        return true;
                      })
                      .done();

                  }
                  else {
                    res.send(400, {status:"fail",message:"that job is already  running"});
                    return next();
                  }
                }
                else if (action == 'stop') {
                  if (activeJobs.hasOwnProperty(jobid)) {
                    timeoutId = activeJobs[jobid];
                    clearTimeout(timeoutId);
                    delete activeJobs[jobid];
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

// server.get(new RegExp('^/jobs/('+reUuidStr+')/includes$'), function(req, res, next) {
//   console.log('looking at: ' + req.params[0]);
//   var match = reUuid.exec(req.params[0]);
//   if (match) {
//     mClient.get(modelSourceUrlPrefix + '/jobs/' + req.params[0] + '/includes', function(e, httpReq, httpResp, obj) {
//       //logTransaction(e, httpReq, httpResp, obj);
//       if (obj){
//         res.send(obj.entities);
//       }
//       return next();
//     });
//   }
//   else {
//     res.send(400, {msg:'malformed uuid'});
//     return next();
//   }
// });
// 
// 
// server.get(new RegExp('^/jobs/('+reUuidStr+')/includes/('+reUuidStr+')/references$'), function(req, res, next) {
//   var match0 = reUuid.exec(req.params[0]),
//       match1 = reUuid.exec(req.params[1]);
// 
//   if (match0 && match1) {
//     mClient.get(modelSourceUrlPrefix + req.url, function(e, httpReq, httpResp, obj) {
//       //logTransaction(e, httpReq, httpResp, obj);
//       if (obj){
//         res.send(obj.entities);
//       }
//       return next();
//     });
//   }
//   else {
//     res.send(400, {msg:'malformed uuid'});
//     return next();
//   }
// });

// ------------------------------------------------------------------

server.listen(8001, function() {
  log.write('=======================================================');
  log.write('loadgen server start, listening: ' + server.url);
});
