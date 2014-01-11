/*jshint eqnull:true, evil: true */
var xtend = require('xtend');
var create = require('object-create');
var jsonify = require('jsonify');
var has = require('has');


var reservedNames = {
  use: true,
  setMethod: true,
  getMethod: true,
  eachMethod: true,
  eachLayer: true,
  fork: true,
  instance: true
};


function findAvailable(args, name) {
  for (var i = 0, l = args.length; i < l; i++)
    if (args[i] === name) return findAvailable(args, name + '_');
  return name;
}


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


// Adds or upgrade an extensible method to the object.
Extensible.prototype.setMethod = function(name, args, metadata, upgrade) {
  if (name in this && !upgrade)
    throw new Error(
      "Name '" + name + "' already exists in the prototype chain");

  if (has(reservedNames, name))
    throw new Error("Name '" + name + "' is reserved");

  var str = jsonify.stringify(name);
  var argsArray = args && args.split(/\s*,\s*/) || [];
  // layer argument
  var layer = findAvailable(argsArray, 'layer');
  // Extra argument that layers can use to send data across non-adjacent
  // layers in the chain. Each layer has the opportunity of modifying the
  // state(stateNew) but if a falsy value is passed, the original state
  // persists(stateOrig)
  var stateOrig = findAvailable(argsArray, 'stateOrig');
  var stateNew = findAvailable(argsArray, 'stateNew');
  // helpers
  var ctx = findAvailable(argsArray, 'ctx');
  var next = findAvailable(argsArray, 'next');

  var largs = argsArray.slice();
  largs.push(layer);
  largs.push(stateOrig);

  this[name] =
    new Function(args,
      '\n  return this._top['+str +'].call(this, '+args +', this._top);\n');

  var nargs = argsArray.slice();
  nargs.push(stateNew);

  this._layerClass.prototype[name] =
    new Function(largs.join(', '),
      '\n  var '+ctx+' = this;' +
      '\n  var '+next+' = '+layer+'.next;' +
      '\n  if ('+layer+'.impl['+str+'])' +
      '\n    return '+layer+'.impl['+str+'].call('+ctx+', '+args+', ' +
      '\n      function('+nargs.join(',')+') {' +
      '\n        '+next+'['+str+'].call('+ctx+', '+args+', ' +
          next+', '+stateNew+' || '+stateOrig+');' +
      '\n      }, '+layer+', '+stateOrig+');' +
      '\n  return '+next+'['+str+'].call('+ctx+', '+args+', ' +
          next+', '+stateOrig+');\n');

  metadata = xtend({
    name: name,
    args: argsArray,
    implementation: this[name],
    layerImplementation: this._layerClass.prototype[name]
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
