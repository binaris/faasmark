'use strict';

exports.sleeper = function sleeper(event, context, callback) {
  const ms = event.queryStringParameters && event.queryStringParameters.ms;
  if (!/^(\d|[1-9]\d{1,4})$/.test(ms)) {
    return callback(null, { statusCode: 400, body: `Missing or invalid query string parameter: ms: ${ms}` });
  }
  setTimeout(() => callback(null, { statusCode: 200, body: '' }), parseInt(ms));
}
