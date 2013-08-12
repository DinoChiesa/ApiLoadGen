//
// weightedRandomSelector.js
//
// simple weighted random selector.
//
// Fri, 26 Jul 2013  11:14
//


function WeightedRandomSelector(a) {
  // A must be an array of arrays. Each inner array is 2 elements,
  // with the item value as the first element and the weight for
  // that value as the second. The items need not be in any
  // particular order.  eg,
  // var fish = [
  //   //["name",      weight]
  //   ["Shark",      3],
  //   ["Shrimp",     50],
  //   ["Sardine",    10],
  //   ["Herring",    20],
  //   ["Anchovies",  10],
  //   ["Mackerel",   50],
  //   ["Tuna",       8]
  // ];

  var i, L;
  this.totalWeight = 0;
  this.a = a;
  this.selectionCounts = [];
  this.weightThreshold = [];
  // initialize
  for (i = 0, L = a.length; i<L; i++) {
    this.totalWeight += a[i][1];
    this.weightThreshold[i] = this.totalWeight;
    this.selectionCounts[i] = 0;
  }
}

WeightedRandomSelector.prototype.select = function() {
  // select a random value
  var R = Math.floor(Math.random() * this.totalWeight),
      i, L;

  // now find the bucket that R value falls into.
  for (i = 0, L = this.a.length; i < L; i++) {
    if (R < this.weightThreshold[i]) {
      this.selectionCounts[i]++;
      return(this.a[i]);
    }
  }
  return this.a[L - 1];
};


module.exports = WeightedRandomSelector;
