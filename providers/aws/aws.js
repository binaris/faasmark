'use strict';

const https = require('https');
const AWS = require('aws-sdk');
const util = require('./util.js');

const createCloudDriver = exports.createCloudDriver = function createCloudDriver(serviceName, params) {
  AWS.config.update({
    region: params.region,
    httpOptions: { agent: new https.Agent({ maxSockets: 4096, keepAlive: true }), timeout: 333000 },
  });

  const cloudFormation = new AWS.CloudFormation();
  const lambda = new AWS.Lambda();

  let serviceUrl = undefined;

  function getServiceUrl(callback) {
    cloudFormation.describeStacks({ StackName: serviceName }).send((error, data) => {
      if (error) {
        console.error(`getServiceUrl: CloudFormation error ${error.statusCode}: ${error.message}`);
        callback(`CF Error: ${error.statusCode}`);
        return;
      }
      const outputs = data.Stacks[0].Outputs;
      for (const output of outputs) {
        if (output.OutputKey === 'ServiceEndpoint') {
          serviceUrl = output.OutputValue;
          callback(null, serviceUrl);
          return;
        }
      }
      console.error(`getServiceUrl: Missing service endpoint in CloudFormation stack`);
      callback('CF Error: Missing endpoint');
    });
  }

  function invokeLambdaWithHTTP(functionName, params, callback) {

    function invokeThroughUrl() {
      util.httpsGet(`${serviceUrl}/${functionName}`, params, callback);
    }

    if (serviceUrl) {
      invokeThroughUrl();
    } else {
      getServiceUrl(error => {
        if (error) {
          callback(error);
        } else {
          invokeThroughUrl();
        }
      });
    }
  }

  function invokeLambdaWithSDK(functionName, params, callback) {
    const payload = params ? JSON.stringify({ queryStringParameters: params }) : null;
    lambda.invoke({ FunctionName: `${serviceName}-${functionName}`, Payload: payload }, (error, data) => {
      if (error) {
        return callback(error);
      }
      data = eval(data);
      if (data.StatusCode !== 200) {
        return callback(data.StatusCode);
      }
      if (data.FunctionError) {
        return callback(data.FunctionError);
      }
      const payload = JSON.parse(data.Payload);
      if (!payload) {
        return callback(null, null);
      }
      if (payload.statusCode !== 200) {
        return callback(payload.statusCode);
      }
      callback(null, payload.body);
    })
  }

  function invokeWithMethod(method, functionName, params, callback) {
    if (method === 'http') {
      return invokeLambdaWithHTTP(functionName, params,  callback);
    }
    if (method === 'sdk') {
      return invokeLambdaWithSDK(functionName, params,  callback);
    }
    const error = 'Invalid lambda invocation method: ' + method;
    console.error(error);
    throw error;
  };

  function invoke(functionName, params, callback) {
    return invokeWithMethod('sdk', functionName, params, callback);
  }

  return { invoke, invokeWithMethod, getServiceUrl };
};

const createCloudDriverFromLambdaContext = exports.createCloudDriverFromLambdaContext = function createCloudDriverFromLambdaContext(context) {
  const serviceName = context.functionName.substr(0, context.functionName.lastIndexOf('-'));
  const region = context.invokedFunctionArn.split(':')[3];
  return createCloudDriver(serviceName, region);
};

if (require.main === module) {
  const settings = require('../../settings.json');
  const driver = createCloudDriver(settings.serviceName, settings.providers.aws);
  driver.getServiceUrl((error, serviceUrl) => {
    if (error) {
      console.error('Error obtaining service URL:', error);
    } else {
      console.log('serviceUrl:', serviceUrl);
    }
  });
}
