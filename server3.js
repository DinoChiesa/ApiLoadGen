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
//   etc
//
// You may have to do the following to run this code:
//
//    npm install restify
//
//
// created: Mon Jul 22 03:34:01 2013
// last saved: <2013-July-22 04:46:31>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------


var restify = require('restify'),
    assert = require('assert'),
    server = restify.createServer(),
    modelSourceUrlPrefix = '/dino/loadgen1',
    reUuidStr = '[a-zA-Z0-9]{8}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{4}-[a-zA-Z0-9]{12}',
    reUuid = new RegExp(reUuidStr),
    mClient = restify.createJsonClient({
      url: 'https://api.usergrid.com/',
      headers: {
        'Accept' : 'application/json'
      }
    });

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

 server.post(new RegExp('^/(jobs|sequences|requests)$'), function(req, res, next) {
   res.send(201, {
     collection: req.params[0],
     id: Math.random().toString(36).substr(3, 8)
   });
   return next();
 });

 server.get(new RegExp('^/(jobs|sequences|requests)$'), function(req, res, next) {
  mClient.get(modelSourceUrlPrefix + '/' + req.params[0], function(e, httpReq, httpResp, obj) {
    //logTransaction(e, httpReq, httpResp, obj);
   res.send(obj.entities);
   return next();
  });
 });

server.get(new RegExp('^/(jobs|sequences|requests)/([^/]+)$'), function(req, res, next) {
  var match = reUuid.exec(req.params[1]);
  console.log('looking at: ' + req.params[1]);
  if (match) {
    console.log('getting ' + req.url);
    mClient.get(modelSourceUrlPrefix + req.url, function(e, httpReq, httpResp, obj) {
      logTransaction(e, httpReq, httpResp, obj);
      res.send(obj.entities[0]);
      return next();
    });
  }
  else {
    res.send(400, {msg:'malformed uuid'});
    return next();
  }
});

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
