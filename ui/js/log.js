// log.js
// ------------------------------------------------------------------
//
// Writes things to a log div. usage:
//   var log = new Log('elementId');
//   log.write('something');
//
// created: Sat Jun 22 16:15:26 2013
// last saved: <2013-August-14 17:17:45>
// ------------------------------------------------------------------
//
// Copyright © 2013 Dino Chiesa
// All rights reserved.
//
// ------------------------------------------------------------------
(function(globalScope){
  'use strict';

  function Log(id) {
    this.elt = document.getElementById(id);
    // race condition - the logging elt may not be rendered yet!
    this.id = id;
    this.buffer = '';
    this.timer = null;
    this.start = (new Date()).getTime();
    this.delays = 0;
  }

  Log.prototype.write = function(str) {
    var time = ((new Date()) - this.start) / 1000, me = this;
    this.buffer = '[' + time + '] ' + str + '<br/>\n' + this.buffer;
    if (this.delays < 8) {
      clearTimeout(this.timer);
      // inserting the stuff into the DOM is done in batches,
      // because there may be a lot of messages.
      // It may actually starve, so count the deferments.
      this.delays++;
      this.timer = setTimeout(function(){flushBuffer.call(me);}, 250);
    }
    else {
      // synchronous
      flushBuffer.call(me);
    }
  };

  function flushBuffer() {
    if ( ! this.elt) {
      this.elt = document.getElementById(this.id);
    }
    if (this.elt) {
      this.elt.innerHTML = this.buffer + this.elt.innerHTML;
      this.buffer = '';
      this.delays = 0;
    }
  }

    if (typeof exports === "object" && exports) {
        exports.Log = Log;
    }
    else {
        globalScope.Log = Log;
    }

}(this));
