#! /usr/local/bin/node
/*jslint node:true */

// promiseDemo1.js
// ------------------------------------------------------------------
//
// Demonstrate promises using the q module in nodejs.
//
// ------------------------------------------------------------------

var q = require('q'),
    sleep = require('sleep'),
    chain;

chain = q.fcall(function(){console.log('start');})
  .then (function() {console.log('starting');})
  .then (function() {console.log('waiting 2500');})
  .then (function() {sleep.usleep(2500 * 1000);})
  .then (function() {console.log('done');})
  .then (function() {console.log('waiting 5500ms');})
  .then (function() {sleep.usleep(5500 * 1000);})
  .then (function() {console.log('done');})
  .then (function() {console.log('waiting 4500');})
  .then (function() {sleep.usleep(4500 * 1000);})
  .then (function() {console.log('done');})
  .then (function() {sleep.usleep(2500 * 1000);})
  .then (function() { process.exit(0);});
