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

const aws = require('./aws.js');

exports.simpleInitiator = (event, context, callback) => {
  if (!/^(\d|[1-9]\d{1,4})$/.test(event.queryStringParameters ? event.queryStringParameters.repeat : '')) {
    return callback(null, { statusCode: 400, body: 'Invalid repeat' });
  }
  const repeat = parseInt(event.queryStringParameters.repeat);

  const driver = aws.createCloudDriverFromLambdaContext(context);

  simpleInitiator(repeat, driver, output => {
    callback(null, { statusCode: 200, body: JSON.stringify(output) });
  });
};
