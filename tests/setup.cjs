// Lets Node import app modules that reference React Native packages.
const Module = require('module');
const path = require('path');
global.__DEV__ = false;
const stubs = {
  'react-native': 'react-native.js',
  '@react-native-async-storage/async-storage': 'async-storage.js',
};
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return path.join(__dirname, 'stubs', stubs[request]);
  return orig.call(this, request, ...rest);
};
