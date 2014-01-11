var assert = require('assert');
var sinon = require('sinon');
var extensible = require('../index');


for (var k in assert) global[k] = assert[k];


describe('extensible object', function() {
  var obj, top, mid, bot, passedState, methodName = 'm';


  beforeEach(function() {
    top = {
      state: function(arg, next) {
        equal(this, obj);
        next(arg, passedState = {data: 5});
      }
    };
    top[methodName] = function(arg1, arg2, arg3, cb, next, layer) {
      equal(this, obj);
      equal(top, layer.impl);
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    mid = {
      state: function(arg, next) {
        equal(this, obj);
        next(arg);
      }
    };
    mid[methodName] = function(arg1, arg2, arg3, cb, next, layer) {
      equal(this, obj);
      equal(mid, layer.impl);
      next(arg1 * 64, arg2, arg3, function(err, rv) { cb(err, rv / 64); });
    };
    bot = function(opts) {
      equal(this, obj);
      // add a method
      this.defineMethod(opts.methodName, 'arg1, arg2, arg3, cb');
      this.defineMethod('state', 'arg');
      var rv = {
        state: function(arg, next, layer, state) {
          equal(this, obj);
          equal(rv, layer.impl);
          equal(passedState, state);
        }
      };
      rv[methodName] = function(arg1, arg2, arg3, cb, next, layer) {
        equal(this, obj);
        equal(rv, layer.impl);
        cb([1, 2], arg1);
      };
      return rv;
    };

    obj = extensible();
    obj.use(bot, {methodName: methodName});
    obj.use(mid);
    obj.use(top);

    sinon.spy(obj._top.impl, methodName);
    sinon.spy(obj._top.next.impl, methodName);
    sinon.spy(obj._top.next.next.impl, methodName);
  });


  it('passes arguments from top to bottom layer', function() {
    obj[methodName](1, 3, 4, function() {});
    assert(obj._top.impl[methodName].calledWith(1, 3, 4));
    assert(obj._top.next.impl[methodName].calledWith(64, 3, 4));
    assert(obj._top.next.next.impl[methodName].calledWith(4096, 3, 4));
  });


  it('passes result from bottom to top layer', function(done) {
    obj[methodName](1, null, null, function(err, rv) {
      deepEqual([1, 2], err);
      deepEqual(1, rv);
      done();
    });
  });


  it('should pass state across layers', function() {
    obj.state(5); // assertion is done in layer definition
  });


  describe('eachLayer', function() {
    it('iterates through each layer', function() {
      var items = [];
      obj.eachLayer(function(layer) { items.push(layer.impl); });
      deepEqual([obj._top.next.next.impl, mid, top], items);
    });
  });


  describe('eachMethodDescriptor', function() {
    it('iterates through each method metadata', function() {
      var items = [];
      obj.eachMethodDescriptor(function(method) { items.push(method); });
      meql([{
        name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']
      }, {
        name: 'state', args: ['arg']
      }], items);
    });
  });


  describe('getMethodDescriptor', function() {
    it('gets method by name', function() {
      meql({name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']},
           obj.getMethodDescriptor('m'));
      meql({name: 'state', args: ['arg']}, obj.getMethodDescriptor('state'));
    });
  });


  describe('instance', function() {
    it('links through the prototype chain', function() {
      assert(obj.isPrototypeOf(obj.instance()));
    });
  });


  describe('fork', function() {
    var forked;
    beforeEach(function() {
      forked = obj.fork();
    });


    it('links through the prototype chain', function() {
      assert(obj.isPrototypeOf(forked));
    });


    it('should copy method descriptors', function() {
      notEqual(obj._methods, forked._methods);
      meql([{
        name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']
      }, {
        name: 'state', args: ['arg']
      }], obj._methods);
      meql([{
        name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']
      }, {
        name: 'state', args: ['arg']
      }], forked._methods);
    });


    it('should copy layers', function() {
      notEqual(obj._top, forked._top);
      notEqual(obj._top.next, forked._top.next);
      notEqual(obj._top.next.next, forked._top.next.next);
      equal(obj._top.impl, forked._top.impl);
      equal(obj._top.next.impl, forked._top.next.impl);
      equal(obj._top.next.next.impl, forked._top.next.next.impl);
    });


    it('should copy layers', function() {
      notEqual(obj._top, forked._top);
      notEqual(obj._top.next, forked._top.next);
      notEqual(obj._top.next.next, forked._top.next.next);
      equal(obj._top.impl, forked._top.impl);
      equal(obj._top.next.impl, forked._top.next.impl);
      equal(obj._top.next.next.impl, forked._top.next.next.impl);
    });


    describe('forked object', function() {
      it("wont affect the original object methods", function() {
        forked.defineMethod('y');
        meql([{
          name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']
        }, {
          name: 'state', args: ['arg']
        }], obj._methods);
        meql([
          {name: 'm', args: ['arg1', 'arg2', 'arg3', 'cb']
        }, {
          name: 'state', args: ['arg']
        }, {
          name: 'y', args: []
        }], forked._methods);
        equal(true, 'm' in obj);
        equal(false, 'y' in obj);
        equal(true, 'y' in forked);
      });


      it("wont affect the original object layers", function() {
        forked.use(top);
        equal(top, forked._top.impl);
        equal(top, forked._top.next.impl);
        equal(mid, forked._top.next.next.impl);
        equal(top, obj._top.impl);
        equal(mid, obj._top.next.impl);
      });
    });
  });


  describe('with upgraded method', function() {
    beforeEach(function() {
      var newTop = {};
      // remove 1 arg
      newTop[methodName] = function(arg1, arg2, cb, next, layer) {
        equal(this, obj);
        equal(newTop, layer.impl);
        // the next layer should be unaffected
        next(arg1, arg2, 1000, cb);
      };
      obj.use(newTop);
      obj.defineMethod(methodName, 'arg1, arg2, cb');
      sinon.spy(obj._top.impl, methodName);
    });


    it('should expose new API', function() {
      obj[methodName](1, 3, function() {});
      assert(obj._top.impl[methodName].calledWith(1, 3));
      assert(obj._top.next.impl[methodName].calledWith(1, 3, 1000));
      assert(obj._top.next.next.impl[methodName].calledWith(64, 3, 1000));
      assert(obj._top.next.next.next.impl[methodName].calledWith(
        4096, 3, 1000));
    });
  });


});


function meql(expected, actual) {
  if (actual.length) {
    for (var i = 0, l = actual.length; i < l; i++) {
      var act = actual[i];
      delete act.implementation;
      delete act.layerImplementation;
    }
  } else {
    delete actual.implementation;
    delete actual.layerImplementation;

  }
  return deepEqual(expected, actual);
}
