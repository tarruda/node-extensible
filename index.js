/* jshint eqnull:true, evil: true */
var xtend = require('xtend');
var create = require('object-create');
var jsonify = require('jsonify');
var has = require('has');


var slice = Array.prototype.slice;

var reservedNames = {
  $use: true,
  $defineMethod: true,
  $getMethodDescriptor: true,
  $eachMethodDescriptor: true,
  $eachLayer: true,
  $fork: true,
  $instance: true,
  $instanceOf: true,
  $layerClass: true,
  $layers: true,
  $descriptors: true,
  $parent: true
};


function findAvailable(args, name) {
  for (var i = 0, l = args.length; i < l; i++)
    if (args[i] === name) return findAvailable(args, name + '_');
  return name;
}

function installLayerClass(target, sup) {
  var layerClass = function Layer(impl, next) {
    this.impl = impl;
    this.next = next;
    layerClass.hasInstances = true;
  };

  if (sup) {
    layerClass.prototype = create(sup.$layerClass.prototype, {
      constructor: {
        value: layerClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  }

  target.$layerClass = layerClass;
}


// Base object only containing the basic infrastructure for adding
// methods and layers 
function Extensible() {
  // methods installed into this object
  this.$descriptors = {};
  this.$layers = {top: null};
  installLayerClass(this);
}


// Adds or upgrade an extensible method to the object. For minimal overhead
// and better vm optimization, the wrapper functions will be generated.
Extensible.prototype.$defineMethod = function(name, args, descriptor) {
  if (has(reservedNames, name))
    throw new Error("Name '" + name + "' is reserved, use another");

  // any name is accepted, let json handle escaping
  var str = jsonify.stringify(name);
  // Get an array of the method parameters
  var argsArray = args && args.split(/\s*,\s*/) || [];
  // Layer argument. 'findAvailable' will ensure we dont clash names
  var layer = findAvailable(argsArray, 'layer');
  // Extra argument that layers can use to send data across non-adjacent
  // layers in the chain. Each layer has the opportunity of modifying the
  // state(stateNew) but if a falsy value is passed, the original state
  // persists(stateOrig)
  var stateOrig = findAvailable(argsArray, 'stateOrig');
  var stateNew = findAvailable(argsArray, 'stateNew');
  // Helpers on the generated method
  var ctx = findAvailable(argsArray, 'ctx');
  var next = findAvailable(argsArray, 'next');
  // largs is the parameter array for the layer version of the method. It
  // contains two extra parameters: 'layer' and 'stateOrig'
  var largs = argsArray.slice();
  largs.push(layer);
  largs.push(stateOrig);
  // nargs is the parameter array for the 'next' function passed to the layer
  // implementation. It has the same signature as the method, but with an
  // trailing 'stateNew' parameter that can be used to modify state for
  // the next layer
  var nargs = argsArray.slice();
  nargs.push(stateNew);

  if (this.$layerClass.hasInstances)
    // If any layers were added for the current layer class, create a new one
    // inheriting from it. This ensures we can safely override methods without
    // affecting previous layers
    installLayerClass(this, this);

  var oargs, oldDescriptor;

  if (oldDescriptor = this.$getMethodDescriptor(name)) {
    // oargs is how we call the next layer. for that we use the old descriptor
    // arguments
    oargs = oldDescriptor.args.slice();
    // nargs also must be updated to receive arguments compatible with the
    // next layer
    nargs = oargs.slice();
    nargs.push(stateNew);
    oargs = oargs.join(', ');
  } else {
    oargs = args;
  }

  // Generate the wrapper on the object itself. It just delegates work to
  // the top layer
  this[name] =
    new Function(args,
      (
      this.DEBUG ?
      '\n  if (!this.$layerClass.hasInstances)' +
      '\n    throw new Error("Layer class implementation missing");' : ''
      ) + 
      '\n  return this.$layers.top['+str+'].call(this, '+args+','+
      ' this.$layers.top);\n');

  // Generate the implementation wrapper on the layer class itself.

  // This function's job is to check if an the implementation for the method
  // is defined on the current layer, and if so, call the implementation with
  // the received args and a 'next' function that user code can use to call
  // the next layer.

  // If no implementation is provided, the next layer will be called directly.
  // This is what allows the user to only 'wrap' certain methods while leaving
  // other unnafected
  this.$layerClass.prototype[name] =
    new Function(largs.join(', '),
      '\n  var '+ctx+' = this;' +
      '\n  var '+next+' = '+layer+'.next;' +
      '\n  if ('+layer+'.impl['+str+'])' +
      '\n    return '+layer+'.impl['+str+'].call('+ctx+', '+args+', ' +
      '\n      function('+nargs.join(', ')+') {' +
      (
      this.DEBUG ?
      '\n        if (!'+next+' || typeof '+next+'['+str+'] !== "function")' +
      '\n          throw new Error(' +
      '              "Method \'"+ '+str+' +"\' has no more layers");\n' :
      ''
      ) +
      '\n        return '+next+'['+str+'].call('+ctx+', '+oargs+', ' +
          next+', '+stateNew+' || '+stateOrig+');' +
      '\n      }, '+layer+', '+stateOrig+');' +
      (
      oldDescriptor && this.DEBUG ?
      '\n  throw new Error(' +
           '"Must provide an implementation for the upgraded method");\n' :
           ''
      ) +
      (
      this.DEBUG ?
      '\n  if (!'+next+' || typeof '+next+'['+str+'] !== "function")' +
      '\n    throw new Error(' +
      '        "Method \'"+ '+str+' +"\' has no more layers");\n' :
      ''
      ) +
      '\n  return '+next+'['+str+'].call('+ctx+', '+args+', ' +
          next+', '+stateOrig+');\n');

  descriptor = xtend({
    name: name,
    args: argsArray,
    objectMethod: this[name],
    layerMethod: this.$layerClass.prototype[name]
  }, descriptor);

  if (oldDescriptor) {
    // keep a link to the old descriptor
    descriptor.old = oldDescriptor;
  }

  this.$descriptors[name] = descriptor;
};


// Wraps the object into a new layer
Extensible.prototype.$use = function(middleware, opts) {
  if (typeof middleware === 'function')
    // call factory function
    middleware = middleware.call(this, opts);

  this.$layers.top = new this.$layerClass(middleware, this.$layers.top);
};


// Returns metadata associated with the method `name`.
Extensible.prototype.$getMethodDescriptor = function(name) {
  return this.$descriptors[name];
};


// Iterates through each installed method
Extensible.prototype.$eachMethodDescriptor = function(cb) {
  for (var k in this.$descriptors) {
    if (!has(this.$descriptors, k)) continue;
    cb(this.$descriptors[k]);
  }
};


// Iterates through each layer of this object
Extensible.prototype.$eachLayer = function(cb) {
  function next(layer) {
    if (!layer) return;
    if (layer.next) next(layer.next);
    cb(layer);
  }
  next(this.$layers.top);
};


// Creates a new object whose prototype is set to the current object.
Extensible.prototype.$instance = function() {
  var rv;

  if (typeof this === 'function') rv = this.$fork(true, true);
  else rv = this.$fork(false, true);

  if (rv.$constructor) {
    var args = slice.call(arguments);
    args.push(rv.$layers.top);
    rv.$constructor.apply(rv, args);
  }

  return rv;
};


// Forks by creating a new object with all methods and layers from the current
// object.
Extensible.prototype.$fork = function(asCallable, inheritProperties) {
  var rv;

  if (asCallable || typeof this === 'function') {
    rv = function Callable() {
      var args = slice.call(arguments);
      args.push(rv.$layers.top);
      return rv.$call.apply(rv, args);
    };

    var k;
    // cant inherit from functions in a portable way, so simply copy
    // the relevant properties
    for (k in reservedNames) {
      if (!has(reservedNames, k)) continue;
      rv[k] = this[k];
    }

    // and also methods defined with '$defineMethod'
    for (k in this.$descriptors) {
      if (!has(this.$descriptors, k)) continue;
      rv[k] = this[k];
    }
  } else {
    rv = create(this);
  }

  if (!inheritProperties) {
    rv.$layers = {top: null};
    rv.$descriptors = xtend({}, this.$descriptors);
    rv.$layerClass = this.$layerClass;
    this.$eachLayer(function(layer) { rv.$use(layer.impl); });
  }

  rv.$parent = this;

  return rv;
};


Extensible.prototype.$instanceOf = function(other) {
  var current = this;

  while (current) {
    if (current.$parent === other)
      return true;
    current = current.$parent;
  }

  return false;
};


module.exports = function extensible() {
  return new Extensible();
};
