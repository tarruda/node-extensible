var assert = require('assert');
var sinon = require('sinon');
var extensible = require('../index');


for (var k in assert) global[k] = assert[k];


describe('extensible', function() {
  var obj, top, mid, bot;

  var methodName = 'm';

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


  it('arguments are sent through all layers', function() {
    obj[methodName](1, 3, 4, function() {});
    assert(obj._top._layer[methodName].calledWith(1, 3, 4));
    assert(obj._top.next._layer[methodName].calledWith(64, 3, 4));
    assert(obj._top.next.next._layer[methodName].calledWith(4096, 3, 4));
  });


  it('result gets passed back through all layers', function(done) {
    obj[methodName](1, null, null, function(err, rv) {
      deepEqual([1, 2], err);
      deepEqual(1, rv);
      done();
    });
  });
});
