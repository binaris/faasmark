'use strict';

const util = require('../../util.js');

const createCloudDriver = exports.createCloudDriver = function createCloudDriver(serviceName) {

  function invoke(functionName, params, callback) {
    util.httpsPost(`https://openwhisk.eu-gb.bluemix.net/api/v1/web/${serviceName}_benchmark/default/${functionName}.json`, params, (error, data) => {
      if (error) {
        return callback(error);
      }
      if (data.statusCode !== 200) {
        return callback(data.statusCode);
      }
      callback(null, JSON.parse(data.body));
    });
  };

  return { invoke };
};
