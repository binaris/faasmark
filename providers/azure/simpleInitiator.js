'use strict';

function getTimeMicroseconds() {
  const t = process.hrtime();
  return t[0] * 1000000 + Math.floor(t[1] / 1000.0);
};

function simpleInitiator(repeat, provider, callback) {
  const skip = Math.max(Math.ceil(repeat / 10), 5);
  const count = repeat + skip;

  const latencies = new Array(repeat);
  let invocations = 0;
  let successes = 0;

  function invokeOneFunction() {
    invocations++;
    const start = getTimeMicroseconds();

    function cb(error) {
      const end = getTimeMicroseconds();
      if (error) {
        console.error(error);
        callback({ error });
        return;
      }
      if (invocations < count) {
        invokeOneFunction();
      }
      if (skip < ++successes) {
        latencies[successes - skip - 1] = end - start;
      }
      if (successes === count) {
        callback({ error: null, latencies });
      }
    }

    provider.invoke('empty', {}, cb);
  }

  invokeOneFunction();
}

const https = require('https');
const querystring = require('querystring');

const agent = new https.Agent({ maxSockets: 4096, keepAlive: true });

function httpsGet(url, params, callback) {
  if (url.substr(0, 8) !== 'https://') {
    throw new Error(`Invalid https url: ${url}`);
  }
  url = `${url.substr(8)}?${querystring.stringify(params)}`;
  const index = url.indexOf('/');
  const req = https.request({
    hostname: url.substr(0, index),
    port: 443,
    path: url.substr(index),
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
    callback(998);
  });
  req.end();
};

module.exports = (context, req) => {
  if (!/^(\d|[1-9]\d{1,4})$/.test(req.query.repeat)) {
    context.res = { status: 400, body: 'Invalid repeat' };
    context.done();
    return;
  }
  const repeat = parseInt(req.query.repeat);

  const driver = {
    invoke: (name, params, callback) => httpsGet(`https://faasmark.azurewebsites.net/api/${name}`, params, callback),
  };

  simpleInitiator(repeat, driver, output => {
    context.res = { status: 200, body: output };
    context.done();
  });
};
