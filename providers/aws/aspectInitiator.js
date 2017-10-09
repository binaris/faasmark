'use strict';

function getTimeMicroseconds() {
  const t = process.hrtime();
  return t[0] * 1000000 + Math.floor(t[1] / 1000.0);
}

function aspectInitiator(aspect, method, lang, memory, repeat, provider, callback) {
  console.log(`Initiating ${aspect} benchmark: ${{ method, lang, memory }[aspect]}`);

  const skip = Math.max(Math.ceil(repeat / 10), 5);
  const count = repeat + skip;
  console.log(`method=${method} lang=${lang} memory=${memory} repeat=${repeat} -> skip=${skip} count=${count}`);

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

    provider.invokeWithMethod(method, `empty-${lang}-${memory}`, null, cb);
  }

  invokeOneFunction();
}

const aws = require('./aws.js');
const util = require('./util.js');

exports.aspectInitiator = (event, context, callback) => {
  const cb = (code, msg) => callback(null, { statusCode: code, body: msg });
  const aspect = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'aspect', /^(method|lang|memory)$/);
  const method = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'method', /^(http|sdk)$/);
  const lang = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'lang', /^(js|py|java)$/);
  const memory = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'memory', /^(128|256|512|1024)$/);
  const repeat = util.extractQueryStringParameter(event, 'queryStringParameters', cb, 'repeat', /^(\d|[1-9]\d|[1-9]\d\d|[1-9]\d\d\d|[1-9]\d\d\d\d)$/, parseInt);
  if (aspect === undefined || method === undefined || lang === undefined || memory === undefined || repeat == undefined) {
    return;
  }

  const driver = aws.createCloudDriverFromLambdaContext(context);

  aspectInitiator(aspect, method, lang, memory, repeat, driver, output => {
    callback(null, { statusCode: 200, body: output });
  });
};
