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

const openwhisk = require('openwhisk');

function main({ repeat }) {
  if (!/^(\d|[1-9]\d{1,4})$/.test(repeat)) {
    return { statusCode: 400, body: 'Invalid repeat' };
  }
  repeat = parseInt(repeat);

  const wsk = openwhisk();
  const driver = {
    invoke: (name, params, callback) => {
        wsk.actions.invoke({ name, params, blocking: true }).then(res => callback(null, res)).catch(callback);
    },
  };

  return new Promise(resolve => {
      simpleInitiator(repeat, driver, output => {
          resolve({ statusCode: 200, body: JSON.stringify(output) });
      });
  });
}