'use strict';

const https = require('https');
const querystring = require('querystring');

const nsort = exports.nsort = function nsort(array) {
  array.sort((a, b) => a - b);
};

const percentile = exports.percentile = function percentile(array, p) {
  return array[Math.max(0, Math.floor(p * array.length / 100.0) - 1)];
};

const agent = new https.Agent({ maxSockets: 4096, keepAlive: true });

function makeURL(url, params) {
  if (url.substr(0, 8) !== 'https://') {
    throw new Error(`Invalid https url: ${url}`);
  }
  url = `${url.substr(8)}?${querystring.stringify(params)}`;
  const index = url.indexOf('/');
  return { host: url.substr(0, index), path: url.substr(index) };
}

const httpsGet = exports.httpsGet = function httpsGet(url, params, callback) {
  const u = makeURL(url, params);
  const req = https.request({
    hostname: u.host,
    port: 443,
    path: u.path,
    method: 'GET',
    agent: agent,
  }, res => {
    if (res.statusCode !== 200) {
      callback(res.statusCode);
      return;
    }
    const chunks = [];
    res.on('data', data => {
      chunks.push(data);
    });
    res.on('end', () => {
      const body = chunks.join('');
      const payload = body ? JSON.parse(body) : {};
      callback(null, payload);
    });
  });
  req.on('error', e => {
    callback(999);
  });
  req.end();
};

const httpsPost = exports.httpsPost = function httpsPost(url, params, callback) {
  const u = makeURL(url, params);
  const body = JSON.stringify(params);
  const req = https.request({
    hostname: u.host,
    port: 443,
    path: u.path,
    method: 'POST',
    agent: agent,
    headers : {
      'Content-Type': 'application/json',
      'Content-Length': body.length,
    },
  }, res => {
    if (res.statusCode !== 200) {
      callback(res.statusCode);
      return;
    }
    const chunks = [];
    res.on('data', data => {
      chunks.push(data);
    });
    res.on('end', () => {
      const body = chunks.join('');
      const payload = body ? JSON.parse(body) : {};
      callback(null, payload);
    });
  });
  req.on('error', e => {
    callback(999);
  });
  req.write(body);
  req.end();
};

const extractQueryStringParameter = exports.extractQueryStringParameter =
function extractQueryStringParameter(request, requestQueryFieldName, respondWithError, parameterName, ...filters) {

  function reportError(code, message) {
    if (respondWithError) {
      console.error(`Error ${code}: ${message}`);
      respondWithError(code, message);
    }
  }

  let value = request[requestQueryFieldName] && request[requestQueryFieldName][parameterName];
  if (value === undefined) {
    return reportError(400, `Missing query string parameter: ${parameterName}`);
  }

  for (const filter of filters) {
    if (filter instanceof RegExp) {
      if (!filter.test(value)) {
        return reportError(400, `Invalid value for query string parameter ${parameterName}: ${value}`);
      }
    }
    else if (typeof(filter) === 'function') {
      value = filter(value);
      if (value === undefined) {
        return reportError(400, `Invalid value for query string parameter ${parameterName}: ${value}`);
      }
    }
    else {
      return reportError(500, `Invalid filter for query string parameter: ${parameterName}`);
    }
  }

  return value;
};