'use strict';

function getTimeMicroseconds() {
  const t = process.hrtime();
  return t[0] * 1000000 + Math.floor(t[1] / 1000.0);
}

function concurrencyInitiator(concurrency, repeat, provider, callback) {
  console.log(`concurrency=${concurrency} repeat=${repeat}`);

  const count = concurrency * repeat;
  const latencies = new Array(count);
  let invocations = 0;
  let successes = 0;
  let retries = 0;
  const params = { ms: 0 };

  function invokeUntilSuccess() {
    invocations++;
    const start = getTimeMicroseconds();

    function cb(error) {
      const end = getTimeMicroseconds();
      if (error) {
        retries++;
        setTimeout(() => provider.invoke('sleeper', params, cb), error.retryDelay || 0);
      } else {
        if (invocations < count) {
          invokeUntilSuccess();
        }
        latencies[successes++] = end - start;
        if (successes === count) {
          callback({ error: null, latencies, retries });
        }
      }
    }

    provider.invoke('sleeper', params, cb);
  }

  while (invocations < concurrency) {
    invokeUntilSuccess();
  }
}

const aws = require('./aws.js');
const util = require('./util.js');

exports.concurrencyInitiator = (event, context, callback) => {
  const cb = (code, msg) => callback(null, { statusCode: code, body: msg });
  const concurrency = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'concurrency', /^(\d|[1-9]\d|[1-9]\d\d)$/, parseInt);
  const repeat = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'repeat', /^(\d|[1-9]\d|[1-9]\d\d|[1-9]\d\d\d|[1-9]\d\d\d\d)$/, parseInt);
  if (concurrency === undefined || repeat == undefined) {
    return;
  }

  const driver = aws.createCloudDriverFromLambdaContext(context);

  concurrencyInitiator(concurrency, repeat, driver, output => {
    callback(null, { statusCode: 200, body: output });
  });
};
