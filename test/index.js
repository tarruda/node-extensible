var assert = require('assert');
var sinon = require('sinon');
var extensible = require('../index');


for (var k in assert) global[k] = assert[k];


describe('extensible object', function() {
  var obj, top, mid, bot, methodName = 'm';


  beforeEach(function() {
    top = {};
    top[methodName] = function(arg1, arg2, arg3, cb, next) {
      equal(this, obj);
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    mid = {};
    mid[methodName] = function(arg1, arg2, arg3, cb, next) {
      equal(this, obj);
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    bot = function(opts) {
      equal(this, obj);
      // add a method
      this.method(opts.methodName, 'arg1, arg2, arg3, cb');
      var rv = {};
      rv[methodName] = function(arg1, arg2, arg3, cb, next) {
        equal(this, obj);
        cb([1, 2], arg1);
      };
      return rv;
    };

    obj = extensible();
    obj.layer(bot, {methodName: methodName});
    obj.layer(mid);
    obj.layer(top);

    sinon.spy(obj.top._layer, methodName);
    sinon.spy(obj.top.next._layer, methodName);
    sinon.spy(obj.top.next.next._layer, methodName);
  });


  it('passes arguments from top to bottom layer', function() {
    obj[methodName](1, 3, 4, function() {});
    assert(obj.top._layer[methodName].calledWith(1, 3, 4));
    assert(obj.top.next._layer[methodName].calledWith(64, 3, 4));
    assert(obj.top.next.next._layer[methodName].calledWith(4096, 3, 4));
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
      deepEqual([{name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']}],
                obj.methods);
      deepEqual([{name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']}],
                forked.methods);
    });


    it('should copy layers', function() {
      notEqual(obj.top, forked.top);
      notEqual(obj.top.next, forked.top.next);
      notEqual(obj.top.next.next, forked.top.next.next);
      equal(obj.top._layer, forked.top._layer);
      equal(obj.top.next._layer, forked.top.next._layer);
      equal(obj.top.next.next._layer, forked.top.next.next._layer);
    });


    it('should copy layers', function() {
      notEqual(obj.top, forked.top);
      notEqual(obj.top.next, forked.top.next);
      notEqual(obj.top.next.next, forked.top.next.next);
      equal(obj.top._layer, forked.top._layer);
      equal(obj.top.next._layer, forked.top.next._layer);
      equal(obj.top.next.next._layer, forked.top.next.next._layer);
    });


    describe('forked object', function() {
      it("wont affect the original object methods", function() {
        forked.method('y');
        deepEqual([{name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']}],
                  obj.methods);
        deepEqual([{name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']},
          {name: 'y', args: []}], forked.methods);
        equal(true, 'm' in obj);
        equal(false, 'y' in obj);
        equal(true, 'y' in forked);
      });


      it("wont affect the original object layers", function() {
        forked.layer(top);
        equal(top, forked.top._layer);
        equal(top, forked.top.next._layer);
        equal(mid, forked.top.next.next._layer);
        equal(top, obj.top._layer);
        equal(mid, obj.top.next._layer);
      });


      it("has the orignal object as prototype", function() {
        equal(obj, Object.getPrototypeOf(forked));
      });
    });
  });
});
