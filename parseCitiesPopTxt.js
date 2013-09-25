#! /usr/local/bin/node
/*jslint node:true */

// parseCitiesPopText.js
// ------------------------------------------------------------------
//
// parse the cities-and-population.txt file into a JSON object.
//
// created: Tue Aug  6 14:36:17 2013
// last saved: <2013-September-24 10:42:15>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------

var fs = require('fs'),
    FileReader = require('./FileReader.js').FileReader,
    filename = 'cities-and-population.txt',
    r = new FileReader(filename),
    labels = [], label,
    line, i, L = 0,
    records = [],
    current,
    degreeRegexp = new RegExp('\uFFFD', 'g'),
    recordCount = 0,
    request = require('./slimNodeHttpClient.js'),
    modelSourceUrlPrefix = 'https://api.usergrid.com/dino/loadgen1',
    options;

  if (typeof String.prototype.startsWith != 'function') {
    String.prototype.startsWith = function (str){
      return this.slice(0, str.length) == str;
    };
  }

while((line = r.read()) !== null) {
  line = line.substr(1);
  if (line === '-' || line === '}') {
    // start of new record
    if (recordCount === 0) {
      for (i=0; i<9; i++) {
        line = r.read().substr(1);
        labels.push(line);
      }
      recordCount++;
    }
    else {
      if (Object.keys(current).length > 0) records.push(current);
    }
    current = {};
    L = 0;
  }
  else {
    if (line.startsWith('[[')) {
      line = line.substr(2).substr(0, line.length - 4);
      label = labels[L++];
      if (label == 'city') { label = 'name';}
      if (line.indexOf('|')> -1) {
        current[label] = line.split('|')[1];
      }
      else {
        current[label] = line;
      }
    }
    else {
      splits = line.split('|');
      for (i=0; i<splits.length; i++) {
        label = labels[L++];
        if (label != 'rank') {
          current[label] = splits[i].replace(degreeRegexp, '');
        }
      }
    }
  }
}

console.log(JSON.stringify(records,null,2));

options = {
  uri: modelSourceUrlPrefix + '/cities',
  method: 'post',
  json : records,
  headers: {
    'Content-type' : 'application/json',
    'Accept' : 'application/json',
    'user-agent' : 'SlimHttpClient/1.0'
  }
};

request(options, function(e, httpResp, body) {
  if (e) {
    console.log('error: ' + e);
  }
  else {
    console.log('done');
  }
});
