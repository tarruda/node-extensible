/*jshint eqnull:true, evil: true */
function installLayerClass(target, sup) {
  target._layerClass = function Layer(layer, next) {
    this._obj = target;
    this._layer = layer;
    this.next = next;
  };

  if (sup) {
    target._layerClass.prototype = Object.create(sup._layerClass.prototype, {
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
  var _this = this;

  // methods installed into this object
  this.methods = [];
  // first and last extensions
  this.top = null;
  installLayerClass(this);
}


// Wraps the object into a new layer
Extensible.prototype.layer = function(layer, opts) {
  if (typeof layer === 'function')
    // call factory function
    layer = layer.call(this, opts);

  this.top = new this._layerClass(layer, this.top);
};


// Adds a new extensible method to the object.
Extensible.prototype.method = function(name, args) {
  if (name in this)
    throw new Error(
      "Name '" + name + "' already exists in the prototype chain");

  var nameStr = JSON.stringify(name);

  this[name] =
    new Function(args,
      '  \nreturn this.top[' + nameStr + '](' + args + ');\n');

  this._layerClass.prototype[name] =
    new Function(args,
      '\n  var _this = this;\n' +
      '  if (this._layer[' + nameStr + '])\n' +
      '    return this._layer[' + nameStr + '].call(this._obj, ' + args + ', \n' +
      '      function(' + args + ') {\n' +
      '        _this.next[' + nameStr + '](' + args + ');\n' +
      '      });\n' +
      '  return this.next[' + nameStr + '](' + args + ');\n');

  this.methods.push(name);
};


// Forks by creating a new object with all methods and layers from the current
// object.
//
// Only the method descriptors and layers are copied, as the new
// object's prototype is set to the current object, which will result in
// all methods being inherited.
//
// The new object will also have its own dedicated layer class, which inherits
// from the current layer class.
Extensible.prototype.fork = function() {
  var rv = Object.create(this);

  rv.top = null;
  rv.methods = this.methods.slice();

  function copyLayer(layer) {
    if (!layer) return;
    if (layer.next) copyLayer(layer.next);
    rv.layer(layer._layer);
  }
  copyLayer(this.top);

  installLayerClass(rv, this);

  return rv;
};


module.exports = function extensible() {
  return new Extensible();
};
