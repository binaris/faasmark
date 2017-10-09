'use strict';

const fs = require('fs');
const util = require('./util.js');
const settings = require('./settings.json');

function createCloudProviders() {
  function createProvider(name) {
    console.log('Initializing cloud provider:', name);

    const driver = require(`./providers/${name}/${name}.js`).createCloudDriver(settings.serviceName, settings.providers[name]);

    function invoke(functionName, params, callback) {
      if (callback) {
        return driver.invoke(functionName, params, callback);
      }
      return new Promise(resolve => {

        driver.invoke(functionName, params, (error, response) => {
          if (error) {
            console.error(`Error invoking function ${functionName} on ${name}:`, error);
            resolve({ error });
          } else {
            if (typeof(response) === 'string') {
              try {
                response = JSON.parse(response);
              } catch (e) {}
            }
            resolve(response);
          }
        });
      });
    }

    return { name, invoke };
  }

  const providers = {};
  for (let name in settings.providers) {
    providers[name] = createProvider(name);
  }

  return providers;
}

async function runSimpleBenchmark(providers, name) {
  const params = { repeat: settings.repeat };
  const plist = Object.values(providers);

  process.stdout.write(`Running simple benchmark... `);
  const start = Date.now();
  const results = await Promise.all(plist.map(provider => provider.invoke('simpleInitiator', params)));
  console.log(`${(Date.now() - start) / 1000.0} sec`);

  const out = [ 'Provider,Repeat,,Min,P10,P20,P30,P40,P50,P60,P70,P80,P90,P99,Max' ];
  for (let i = 0; i < plist.length; i++) {
    if (results[i].error) {
      console.error(`Error on ${plist[i].name}: ${results[i].error}`);
      return;
    }
    const latencies = results[i].latencies;
    const raw = latencies.join(',');
    util.nsort(latencies);
    out.push(`${plist[i].name},${settings.repeat},,${[0,10,20,30,40,50,60,70,80,90,99,100].map(p => util.percentile(latencies, p)).join(',')},,${raw}`);
  }
  fs.writeFileSync(`${name}.simple.csv`, out.join('\n'));
}

async function runAspectBenchmark(provider, name) {
  const tests = [];
  for (const method of [ 'sdk', 'http' ]) {
    tests.push({ aspect: 'method', method: method, lang: 'js', memory: 1024, repeat: settings.repeat });
  }
  for (const lang of [ 'js', 'py', 'java' ]) {
    tests.push({ aspect: 'lang', method: 'sdk', lang: lang, memory: 1024, repeat: settings.repeat });
  }
  for (const memory of [ 128, 256, 512, 1024 ]) {
    tests.push({ aspect: 'memory', method: 'sdk', lang: 'js', memory: memory, repeat: settings.repeat });
  }

  process.stdout.write(`Running aspect benchmark... `);
  const start = Date.now();
  const results = await Promise.all(tests.map(params => provider.invoke('aspectInitiator', params)));
  console.log(`${(Date.now() - start) / 1000.0} sec`);

  const out = [ 'Aspect,Method,Lang,Memory,Repeat,,Min,P10,P20,P30,P40,P50,P60,P70,P80,P90,P99,Max' ];
  for (let i = 0; i < tests.length; i++) {
    if (results[i].error) {
      console.error(`Error in ${tests[i].aspect}[${tests[i][tests[i].aspect]}]`, results[i].error);
      return;
    }
    const latencies = results[i].latencies;
    const raw = latencies.join(',');
    util.nsort(latencies);
    out.push(`${tests[i].aspect},${tests[i].method},${tests[i].lang},${tests[i].memory},${settings.repeat},,${[0,10,20,30,40,50,60,70,80,90,99,100].map(p => util.percentile(latencies, p)).join(',')},,${raw}`);
  }
  fs.writeFileSync(`${name}.aspect.csv`, out.join('\n'));
}

function warmUp(provider, functionName, concurrency) {
  return new Promise(resolve => {
    let invocations = 0;
    let sucesses = 0;
    let errors = 0;
    let timeout;
    const start = Date.now();
    const maxSleep = Math.max(10 * concurrency, 1000);

    process.stdout.write(`Warming up ${concurrency} ${functionName}s... `);

    function callback(error) {
      if (error) {
        if (error.statusCode && error.statusCode === 429) {
          errors++;
          timeout = timeout || setTimeout(invokeOne, 0);
        } else {
          console.error('Unexpected error:', error);
          process.exit(1);
        }
      } else if (++sucesses === concurrency) {
        console.log(`${(Date.now() - start) / 1000.0} sec`);
        resolve();
      }
    }

    function invokeOne() {
      const ms = maxSleep - (Date.now() - start);
      if (0 < sucesses || ms < 100) {
        console.error(`Failed: only ${invocations - errors} invoked out of ${concurrency}`);
        process.exit(1);
      }
      provider.invoke(functionName, { ms }, callback);
      timeout = (++invocations - errors < concurrency) ? setTimeout(invokeOne, 0) : null;
    }

    invokeOne();
  });
}

async function runOneConcurrencyBenchmark(provider, concurrency) {
  const initiators = Math.ceil(concurrency / settings.maxConcurrencyPerInitiator);
  process.stdout.write(`Benchmarking concurrency: ${concurrency} (${initiators} initiators)... `);
  const params = { concurrency: settings.maxConcurrencyPerInitiator, repeat: settings.concurrencyRepeat };
  const start = Date.now();
  const results = await Promise.all(Array.apply(null, Array(initiators)).map(() => provider.invoke('concurrencyInitiator', params)));
  console.log(`${(Date.now() - start) / 1000.0} sec`);

  let retries = 0;
  let latencies = [];
  for (let r of results) {
    if (r.error) {
      console.error('Lambda error:', r.error);
      process.exit(1);
    }
    retries += r.retries;
    latencies.splice(latencies.length, 0, ...r.latencies);
  }
  util.nsort(latencies);
  return { latency: util.percentile(latencies, 99), retries }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runConcurrencyBenchmark(provider, name) {
  await warmUp(provider, 'sleeper', settings.maxConcurrency);
  const out = [ 'Concurrency,Latency,Retries,Ratio' ];
  for (let concurrency = Math.floor(settings.maxConcurrency / 50.0) * 50.0; concurrency; concurrency -= 50) {
    const { latency, retries } = await runOneConcurrencyBenchmark(provider, concurrency);
    out.push(`${concurrency},${latency},${retries},${retries / (concurrency * settings.concurrencyRepeat)}`);
    process.stdout.write('Sleeping... ');
    const start = Date.now();
    await sleep(30000);
    console.log(`${(Date.now() - start) / 1000.0} sec`);
  }
  fs.writeFileSync(`${name}.concurrency.csv`, out.join('\n'));
}

function timestamp() {
  const d = new Date();
  const zp = n => n < 10 ? '0' + n : n;
  return `${d.getFullYear()}-${zp(d.getMonth() + 1)}-${zp(d.getDate())}-${zp(d.getHours())}-${zp(d.getMinutes())}-${zp(d.getSeconds())}`;
}

async function benchmark(providers) {
  const name = timestamp();
  console.log('Starting', name);

  await runSimpleBenchmark(providers, name);

  if (providers.aws) {
    await runAspectBenchmark(providers.aws, name);
  }

  if (settings.maxConcurrency) {
    await runConcurrencyBenchmark(providers.aws, name);
  }
}

function main() {
  const providers = createCloudProviders(settings.providers);

  async function benchmarkAndSleep() {
    const start = Date.now();
    await benchmark(providers);
    const elapsed = Date.now() - start;
    console.log(`Elapsed ${elapsed / 1000.0} sec`);
    if (settings.forever) {
      const sleep = settings.interval - elapsed;
      console.log(`Sleeping ${sleep / 1000.0} sec...`);
      setTimeout(benchmarkAndSleep, sleep);
    }
  }

  benchmarkAndSleep();
}

main();
