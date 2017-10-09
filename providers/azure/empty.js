'use strict';

module.exports = function empty(context, req) {
  req.res = { status: 200, body: '' };
  context.done();
};
