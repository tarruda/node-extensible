/*jshint eqnull:true, evil: true */


// Base object only containing the basic infrastructure for adding
// methods and layers 
function Extensible() {
  // methods installed into this object
  this.methods = {};
  // first and last extensions
  this._top = null;
  // helper class for wrapping extension objects
  this._layerClass = function Layer(layer, next) {
    this._layer = layer;
    this.next = next;
  };
}


// Wraps the object into a new layer
Extensible.prototype.layer = function(layer, opts) {
  if (typeof layer === 'function')
    // call factory function
    layer = layer(this, opts);

  this._top = new this._layerClass(layer, this._top);
};


// Adds a method to the object
Extensible.prototype.method = function(name, args, extraData) {
  if (name in this)
    throw new Error(
      "Name '" + name + "' already exists in the prototype chain");

  var nameStr = JSON.stringify(name);

  this[name] =
    new Function(args,
      '  \nreturn this._top[' + nameStr + '](' + args + ');\n');

  this._layerClass.prototype[name] =
    new Function(args,
      '\n  var _this = this;\n' +
      '  if (_this._layer[' + nameStr + '])\n' +
      '    return _this._layer[' + nameStr + '](' + args + ', \n' +
      '      function(' + args + ') {\n' +
      '        _this.next[' + nameStr + '](' + args + ');\n' +
      '      });\n' +
      '  return _this.next[' + nameStr + '](' + args + ');\n');

  this.methods[name] = extraData;
};


module.exports = function extensible() {
  return new Extensible();
};
