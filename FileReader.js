// Module: FileReader
// Constructor: FileReader(filename, bufferSize = 8192)
// Methods: read() -> String
//          eof() -> boolean
//          close() -> undefined
//

var fs = require("fs"),
    sys = require("sys");

exports.FileReader = function(filename, bufferSize) {

  // return -1
  // when EOF reached
  // fills buffer with next 8192 or less bytes
  function fillBuffer() {
    var b;
    if (c === -1) { return; }
    b = fs.readSync(fd, bufferSize, c, "ascii");
    buffer += b[0];
    c = (b[1] === 0) ? -1 : c + b[1];
    return c;
  }

  var c = 0,
      buffer = "";
  fd = fs.openSync(filename, "r");

  bufferSize = bufferSize || 8192;

  fillBuffer();

  // public:
  this.eof = function() {
    if (c === -1) { return true; }
    if (buffer.indexOf("\n") > -1) { return false; }
    while (buffer.indexOf("\n") === -1) {
      if (c === -1) { return true; }
      fillBuffer();
    }
    return false;
  };

  // public:
  this.read = function() {
    var lineEnd, result = null;
    lineEnd = buffer.indexOf("\n");
    if (lineEnd === -1 && this.eof()) {
      return result;
    }
    else {
      lineEnd = buffer.indexOf("\n");
    }
    result = buffer.substring(0, lineEnd);
    buffer = buffer.substring(result.length + 1, buffer.length);
    return result;
  };

  this.close = function() {
    if (fd !== -1) { fs.closeSync(fd); }
    fd = -1;
    c = -1;
  };

  return this;
};
