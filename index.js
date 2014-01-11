/*jshint eqnull:true, evil: true */
var xtend = require('xtend');


var create = Object.create;


function installLayerClass(target, sup) {
  target._layerClass = function Layer(impl, next) {
    this.impl = impl;
    this.next = next;
    this.data = {
      layer: this,
      next: next,
      obj: target
    };
  };

  if (sup) {
    target._layerClass.prototype = create(sup._layerClass.prototype, {
      constructor: {
        value: target._layerClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  }
}


// Base object only containing the basic infrastructure for adding
// methods and layers 
function Extensible() {
  // methods installed into this object
  this._methods = [];
  this._methodsByName = {};
  this._top = null;
  installLayerClass(this);
}


// Wraps the object into a new layer
Extensible.prototype.use = function(layer, opts) {
  if (typeof layer === 'function')
    // call factory function
    layer = layer.call(this, opts);

  this._top = new this._layerClass(layer, this._top);
};


// Adds a new extensible method to the object.
Extensible.prototype.addMethod = function(name, args, metadata) {
  if (name in this)
    throw new Error(
      "Name '" + name + "' already exists in the prototype chain");

  var str = JSON.stringify(name);

  this[name] =
    new Function(args,
      '\n  var next = this._top;' +
      '\n  return next[' + str + '].call(this, ' + args + ', next);\n');

  this._layerClass.prototype[name] =
    new Function(args,
      '\n  var _this = this;' +
      '\n  var layer = arguments[arguments.length - 1];' +
      '\n  var next = layer.next;' +
      '\n  if (layer.impl[' + str + '])' +
      '\n    return layer.impl[' + str + '].call(this, ' + args + ', ' +
      '\n      function(' + args + ') {' +
      '\n        next[' + str + '].call(_this, ' + args + ', next);' +
      '\n      }, layer);' +
      '\n  return next[' + str + '].call(this, ' + args + ', next);\n');

  metadata = xtend({
    name: name,
    args: args && args.split(/\s*,\s*/) || []
  }, metadata);

  this._methods.push(metadata);
  this._methodsByName[name] = metadata;
};


// Returns metadata associated with the method `name`.
Extensible.prototype.getMethod = function(name) {
  return this._methodsByName[name];
};


// Iterates through each installed method
Extensible.prototype.eachMethod = function(cb) {
  for (var i = 0, l = this._methods.length; i < l; i++)
    cb(this._methods[i]);
};


// Iterates through each layer of this object
Extensible.prototype.eachLayer = function(cb) {
  function next(layer) {
    if (!layer) return;
    if (layer.next) next(layer.next);
    cb(layer);
  }
  next(this._top);
};


// Creates a new object whose prototype is set to the current object.
Extensible.prototype.instance = function() {
  return create(this);
};


// Forks by creating a new object with all methods and layers from the current
// object.
//
// The difference from 'instance' is that the new object receives copies
// of the layers and method descriptors, so it can be modified independently
// from the current object.
//
// The new object will also have its own dedicated layer class, which inherits
// from the current layer class.
Extensible.prototype.fork = function() {
  var rv = this.instance();

  rv._top = null;
  rv._methods = this._methods.slice();
  rv._methodsByName = xtend({}, this._methodsByName);
  this.eachLayer(function(layer) { rv.use(layer.impl); });
  installLayerClass(rv, this);

  return rv;
};


module.exports = function extensible() {
  return new Extensible();
};
