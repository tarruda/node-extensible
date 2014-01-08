var assert = require('assert');
var sinon = require('sinon');
var extensible = require('../index');


for (var k in assert) global[k] = assert[k];


describe('extensible object', function() {
  var obj, top, mid, bot, methodName = 'm';


  beforeEach(function() {
    top = {};
    top[methodName] = function(arg1, arg2, arg3, cb, next) {
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    mid = {};
    mid[methodName] = function(arg1, arg2, arg3, cb, next) {
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    bot = function(obj, opts) {
      // add a method
      obj.method(opts.methodName, 'arg1, arg2, arg3, cb');
      var rv = {};
      rv[methodName] = function(arg1, arg2, arg3, cb, next) {
        cb([1, 2], arg1);
      };
      return rv;
    };

    obj = extensible();
    obj.layer(bot, {methodName: methodName});
    obj.layer(mid);
    obj.layer(top);

    sinon.spy(obj._top._layer, methodName);
    sinon.spy(obj._top.next._layer, methodName);
    sinon.spy(obj._top.next.next._layer, methodName);
  });


  it('passes arguments from top to bottom layer', function() {
    obj[methodName](1, 3, 4, function() {});
    assert(obj._top._layer[methodName].calledWith(1, 3, 4));
    assert(obj._top.next._layer[methodName].calledWith(64, 3, 4));
    assert(obj._top.next.next._layer[methodName].calledWith(4096, 3, 4));
  });


  it('passes result from bottom to top layer', function(done) {
    obj[methodName](1, null, null, function(err, rv) {
      deepEqual([1, 2], err);
      deepEqual(1, rv);
      done();
    });
  });


  describe('fork', function() {
    var forked;
    beforeEach(function() {
      forked = obj.fork();
    });


    it('should copy method descriptors', function() {
      notEqual(obj.methods, forked.methods);
      deepEqual(['m'], obj.methods);
      deepEqual(['m'], forked.methods);
    });


    it('should copy layers', function() {
      notEqual(obj._top, forked._top);
      notEqual(obj._top.next, forked._top.next);
      notEqual(obj._top.next.next, forked._top.next.next);
      equal(obj._top._layer, forked._top._layer);
      equal(obj._top.next._layer, forked._top.next._layer);
      equal(obj._top.next.next._layer, forked._top.next.next._layer);
    });


    it('should copy layers', function() {
      notEqual(obj._top, forked._top);
      notEqual(obj._top.next, forked._top.next);
      notEqual(obj._top.next.next, forked._top.next.next);
      equal(obj._top._layer, forked._top._layer);
      equal(obj._top.next._layer, forked._top.next._layer);
      equal(obj._top.next.next._layer, forked._top.next.next._layer);
    });


    describe('forked object', function() {
      it("wont affect the original object methods", function() {
        forked.method('y');
        deepEqual(['m'], obj.methods);
        deepEqual(['m', 'y'], forked.methods);
        equal(true, 'm' in obj);
        equal(false, 'y' in obj);
        equal(true, 'y' in forked);
      });


      it("wont affect the original object layers", function() {
        forked.layer(top);
        equal(top, forked._top._layer);
        equal(top, forked._top.next._layer);
        equal(mid, forked._top.next.next._layer);
        equal(top, obj._top._layer);
        equal(mid, obj._top.next._layer);
      });


      it("has the orignal object as prototype", function() {
        equal(obj, Object.getPrototypeOf(forked));
      });
    });
  });
});
