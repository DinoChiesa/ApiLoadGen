// getIpForCity.js

var usergrid = require('usergrid'),
    q = require('q'),
    ipClient = new usergrid.client({
    orgName:'mukundha',
    appName:'testdata',
    URI:'https://api.usergrid.com',
    logging: false, //optional - turn on logging, off by default
    buildCurl: false //optional - turn on curl commands, off by default
}),
        WeightedRandomSelector = require('./weightedRandomSelector.js');

function getType(obj) {
  return Object.prototype.toString.call(obj);
}


function promisedGetIp(city) {
  var deferredPromise = q.defer(),

      options = {method:'GET', endpoint:'cities' , qs: {ql:'select * where city=\'' + city + '\'' }};
  ipClient.request(options,function(e,res){
    //console.log(JSON.stringify(res));
    var i;
    if ( res.entities && res.entities[0]){
      var res = res.entities[0];
      var ranges = res.ranges ;
      var noOfRanges = res.ranges.length;

      var selectedRange = res.ranges[Math.floor(Math.random() * noOfRanges)];
      var start = parseInt(selectedRange[0]);
      var end = parseInt(selectedRange[1]);

      var index=Math.floor(Math.random()*(start-end));
      var selected = start + index;

      var w =  Math.floor(( selected / 16777216 ) % 256);
      var x =  Math.floor(( selected / 65536    ) % 256);
      var y =  Math.floor(( selected / 256      ) % 256);
      var z =  Math.floor(( selected            ) % 256);

      var ip = w + "." + x + "." + y + "." + z ;
      deferredPromise.resolve(ip);
    }
    else {
      deferredPromise.resolve(ip);
    }
  });
  return deferredPromise.promise;
}


function geoToRandomIp(city) {
  var p = q.resolve(city)
    .then(promisedGetIp);
  return p;
}

function showProps(obj) {
  for (var attr in obj) {
    if (obj.hasOwnProperty(attr)) {
      console.log(attr);
    }
  }
}


function promisedRetrieveCities() {
  var deferredPromise = q.defer(),
      modelClient = new usergrid.client({
        orgName:'dino',
        appName:'loadgen1',
        URI:'https://api.usergrid.com',
        logging: false, //optional - turn on logging, off by default
        buildCurl: false //optional - turn on curl commands, off by default
      }),
      options = {
        method:'GET',
        endpoint:'cities' ,
        qs: {limit:1000}
      };

  modelClient.request(options, function(e,res){
    var a, type, cities, e1;
    if (e) {
      console.log('retrieving cities, error: ' + e);
      deferredPromise.resolve([]);
    }
    else {
      cities = res.entities.map(function(elt) {
        return [ elt, Number(elt.pop2010) ];
      });
    }
    deferredPromise.resolve(cities);
  });
  return deferredPromise.promise;
}



// `condition` is a function that returns a boolean
// `body` is a function that returns a promise
// returns a promise for the completion of the loop
function promiseWhile(ctx) {
  var condition = ctx.condition, body = ctx.body,
      done = q.defer();
    function oneStep() {
        if (!condition()) return done.resolve();
        // Use `when`, in case `body` does not return a promise.
        // When it completes loop again otherwise, if it fails, reject the
        // done promise
        q.when(body(), oneStep, done.reject);
    }
    q.nextTick(oneStep);
    return done.promise;
}


function doTest() {
  q.resolve(true)
    .then(promisedRetrieveCities)
    .then(function(c) {
      var cities = c;
      return new WeightedRandomSelector(cities);
    })
    .then(function(c){
      var i = 0, citySelector = c;
      return {
        condition:function() {
          return i<40;
        },
        body: function() {
          var city, ip,  deferred = q.defer();
          city = citySelector.select()[0];
          q.resolve(city.name.toUpperCase())
            .then(geoToRandomIp)
            .then(function (ip) {
              console.log(city.name + ': ' + ip);
              i++;
              deferred.resolve(i);
            })
            .done();
          return deferred.promise;
        }
      };
    })
    .then(promiseWhile)
    .done(function(){ process.exit(0); },
          function(e){
            console.log('fail: ' + e);
            console.log(e.stack);
            process.exit(0); });
}


doTest();
