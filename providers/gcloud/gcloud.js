'use strict';

const crypto = require('crypto');
const child_process = require('child_process');
const util = require('./util.js');

const BUCKET_NAME = 'functions-storage-bucket';

const createCloudDriver = exports.createCloudDriver = function createCloudDriver(serviceName, driverParams) {

  function invoke(functionName, params, callback) {
    params.__function_context__ = JSON.stringify({ serviceName, region: driverParams.region, project: driverParams.project });
    util.httpsGet(`https://${driverParams.region}-${driverParams.project}.cloudfunctions.net/${serviceName}-${functionName}`, params, callback);
  }

  return { invoke };
}

const createCloudDriverFromLambdaRequest = exports.createCloudDriverFromLambdaRequest = function createCloudDriverFromLambdaRequest(request) {
  const context = JSON.parse(request.query.__function_context__ || '{}');
  return createCloudDriver(context.serviceName, context);
}

const term = (() => {
  const PLAIN = '\u001b[0m'
  const RED = '\u001b[31m'
  const YELLOW = '\u001b[33m'

  return {
    log: (...args) => {
      console.log(`${YELLOW}${args.map(a => a.toString()).join(' ')}${PLAIN}`);
    },
    err: (...args) => {
      console.error(`${RED}${args.map(a => a.toString()).join(' ')}${PLAIN}`);
    },
  };
})();

function exec(cmd) {
  try {
    return child_process.execSync(cmd).toString();
  } catch (e) {
    term.err('Error in command:', cmd);
    return null;
  }
}

const createProject = exports.createProject = function createProject() {
  const projectName = `faasmark-${crypto.randomFillSync(Buffer.alloc(10)).toString('hex')}`;

  term.log('Creating gcloud project:', projectName);
  if (exec(`gcloud projects create ${projectName}`) === null) {
    term.err('Error creating gcloud project');
    return;
  }

  return projectName;
};

const deleteProject = exports.deleteProject = function deleteProject(projectName) {
  term.log('Deleting gcloud project:', projectName);
  if (exec(`gcloud --quiet projects delete ${projectName}`) === null) {
    term.err('Error deleting gcloud project');
  }
};

const setupProject = exports.setupProject = function setupProject(projectName, serviceName) {
  term.log('Enabling cloud functions api');
  if (exec(`gcloud --project=${projectName} service-management enable cloudfunctions.googleapis.com`) === null) {
    term.err('Error enabling cloud functions api');
    return;
  }

  term.log('Enabling billing api');
  if (exec(`gcloud --project=${projectName} service-management enable cloudbilling.googleapis.com`) === null) {
    term.err('Error enabling billing api');
    return;
  }

  term.log('Obtaining billing accounts');
  const billing = exec(`gcloud --project=${projectName} beta billing accounts list`);
  if (billing === null) {
    term.err('Error obtaining billing accounts list');
    return;
  }
  const lines = billing.split('\n');
  if (lines.length < 3) {
    term.err('No billing account found');
    return;
  }
  const account = lines[1].split('  ');

  term.log(`Linking project to billing account ${account[0]} (${account[1]})`);
  if (exec(`gcloud beta billing projects link ${projectName} --billing-account=${account[0]}`) === null) {
    term.err('Error enabling billing');
    return;
  }
};

const install = exports.install = function install(projectName, region, serviceName) {
  term.log('Creating source code bucket');
  if (exec(`gsutil mb -p ${projectName} -l ${region} gs://${serviceName}-${BUCKET_NAME}/`) === null) {
    term.err('Error creating storage bucket');
    return;
  }
}

const uninstall = exports.uninstall = function uninstall(projectName, region, serviceName) {
  term.log('Deleting cloud functions');
  if (exec(`gcloud --project=${projectName} beta functions delete ${serviceName}-concurrencyInitiator --region=${region}`) === null) {
    term.err('Error deleting cloud function');
  }
  if (exec(`gcloud --project=${projectName} beta functions delete ${serviceName}-sleeper --region=${region}`) === null) {
    term.err('Error deleting cloud function');
  }

  term.log('Deleting source code bucket');
  if (exec(`gsutil rm -r gs://${serviceName}-${BUCKET_NAME}`) === null) {
    term.err('Error deleting storage bucket');
  }
};

const deploy = exports.deploy = function deploy(projectName, region, serviceName) {
  function deployFunction(name) {
    return exec(`gcloud --project=${projectName} beta functions deploy ${serviceName}-${name} --entry-point=${name} --region=${region} --timeout=300 --memory=1024MB --stage-bucket=${serviceName}-${BUCKET_NAME} --source=. --trigger-http`);
  }

  term.log('Deploying cloud functions');
  if (deployFunction('empty') === null || !deployFunction('simpleInitiator') === null) {
    term.err('Error deploying cloud functions');
    return;
  }
};

const SERVICE = 'faas-mark';
const GCLOUD_REGION = require('./settings.json').providers.gcloud.region;
const GCLOUD_PROJECT = require('./settings.json').providers.gcloud.project;

function main() {
  function usage() {
    const execname = process.argv[1].substr(process.argv[1].lastIndexOf('/') + 1);
    console.error(`usage: ${execname} <command>`);
    console.error();
    console.error('        Available commands:');
    console.error();
    console.error('        createproject            create a new project');
    console.error('        deleteproject <project>  delete a project (be careful, this could delete other projects as well)');
    console.error('        setupproject <project>   set up a project for running the benchmark');
    console.error('        install                  create benchmark resources');
    console.error('        uninstall                delete benchmark resources');
    console.error('        deploy                   deploy benchmark functions');
    console.error();
    process.exit(1);
  }

  if (process.argv.length < 3) {
    usage();
  }
  switch (process.argv[2]) {
    case 'createproject':
      if (process.argv.length !== 3) {
        usage();
      }
      console.log('Created:', createProject());
      break;
    case 'deleteproject':
      if (process.argv.length !== 4) {
        usage();
      }
      deleteProject(process.argv[3]);
      break;
    case 'setupproject':
      if (process.argv.length !== 4) {
        usage();
      }
      setupProject(process.argv[3]);
      break;
    case 'install':
      if (process.argv.length !== 3) {
        usage();
      }
      install(GCLOUD_PROJECT, GCLOUD_REGION, SERVICE);
      break;
    case 'uninstall':
      if (process.argv.length !== 3) {
        usage();
      }
      uninstall(GCLOUD_PROJECT, GCLOUD_REGION, SERVICE);
      break;
    case 'deploy':
      if (process.argv.length !== 3) {
        usage();
      }
      deploy(GCLOUD_PROJECT, GCLOUD_REGION, SERVICE);
      break;
  }
}

if (require.main === module) {
  main();
}
