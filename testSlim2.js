// testSlim2.js
// ------------------------------------------------------------------
//
// Description goes here....
//
// created: Wed Aug  7 15:44:56 2013
// last saved: <2013-August-07 17:06:00>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------

function Log(id) { }

Log.prototype.write = function(str) {
  var time = (new Date()).toString(), me = this;
  console.log('[' + time.substr(11, 4) + '-' +
              time.substr(4, 3) + '-' + time.substr(8, 2) + ' ' +
              time.substr(16, 8) + '] ' + str );
};


var request = require('./slimNodeHttpClient.js'),
    http = require('http'),
    log = new Log(),
    modelSourceUrlPrefix = 'https://api.usergrid.com/dino/loadgen1',
    bdy = {"grant_type":"password","username":"Operator1","password":"LoadMeUp"};
    requestOpts = {
      uri: modelSourceUrlPrefix + '/token',
      method: 'post',
      json: bdy,
      headers: {
        accept : 'application/json',
        'user-agent' : 'SlimHttpClient/1.0'
      }
    };

log.write('requesting ' + JSON.stringify(requestOpts,null,2));
//log.write('bdy: ' + JSON.stringify(bdy,null,2));

request(requestOpts, function(e, httpResp, body) {
  if (e) {
    log.write('error?: ' + e);
    log.write('error?: ' + JSON.stringify(e,null,2));
  }
  else {
    log.write('status: ' +httpResp.statusCode);
    log.write(JSON.stringify(body, null,2));
    // log.write(body);
    log.write('keys(httpResp):');
    log.write(JSON.stringify(Object.keys(httpResp),null,2));
    log.write(JSON.stringify(httpResp.headers,null,2));
  }
});
