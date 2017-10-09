'use strict';

const util = require('../../util.js');

const createCloudDriver = exports.createCloudDriver = function createCloudDriver(serviceName) {

  function invoke(functionName, params, callback) {
    util.httpsGet(`https://faasmark.azurewebsites.net/api/${functionName}`, params, callback);
  }

  return { invoke };
}
