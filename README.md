# FaaS Mark

FaaSMark is a benchmark for serverless compute platforms. It is designed to measure function invocation latency across different clouds and using different invocation methods and function parameters.

The benchmark currently test latency under different:
* Invocation mathods (HTTP vs SDK)
* Programming languages
* Memory sizes
* Load conditions
* FaaS providers

This version supports aspect (invocation memory, programming languages and memory size) benchmarks and concurrency benchmarks only on AWS Lambda.

## Architecture

Benchmark code is divided into three parts:

0. **Client** is the code that drives the benchmark process. It can run on your local machine or any cloud VM/container.
0. **Initiator** is a FaaS function that is deployed on the platform being benchmarked. The initiator is responsible for repeatedly invoking empty functions (see below) and measuring their invocation latencies. There are two types of initiators: `simpleInitiator` and `concurrencyInitiator`. The first is used for measuring different aspects of function invocation (method, languages and memory sizes) and comparing different cloud platforms. The second is used for load tests.
0. **Empty** is a FaaS function that retuns immediately after invocation. This function is deployed on the FaaS platform being benchmarked. Empty is implemented is JavaScript across on platforms and in multiple languages on AWS Lamda. Concurrency tests use a more complex version of empty called `sleeper` that can sleep for a specified interval before retuning. This feature is used for *warming up* multiple functions containers before starting the benchmark itself.

Deploying both initiator and empty on the same FaaS platforms assures that no factors outside of the platform affect invocation latency.

## Usage

In order to perform the benchmark you first need to deploy functions to the different FaaS provider platforms. See how to below.

Invoke the benchmark using the command

    node faasmark.js

Benchmark behavior is control by the file *settings.json* which has the following fields:


| Name                         | Values      | Description                                                     |                           |
| --------------------------   | ----------- | --------------------------------------------------------------- |                           |
| `forever`                    | `true`\     | `false`                                                         | Test once or loop forever |
| `interval`                   | Number      | Milliseconds between beginning of tests                         |                           |
| `serviceName`                | `faas-mark` | Change only if you change deployment code                       |                           |
| `repeat`                     | Number      | How many times Empty is invoked by Initiator                    |                           |
| `concurrencyRepeat`          | Number      | Same as repeat for concurrency (load) tests                     |                           |
| `maxConcurrency`             | Number      | Maximum concurrent invocations (load level)                     |                           |
| `maxConcurrencyPerInitiator` | Number      | Maximum concurrent invocations from a single initiator function |                           |
| `providers.aws.region`       | String      | AWS region name                                                 |                           |
| `providers.gcloud.region`    | String      | Google Cloud region name                                        |                           |
| `providers.gcloud.project`   | String      | Google Cloud project name                                       |                           |

Note that automatic deployment onto Azure and Bluemix is not supported yet and their settings are currently hard coded.

## Deployment

Deployment method varies between clouds.

### AWS

Use the Serverless Framework (sls) to deploy functions to AWS Lambda. Your AWS credentials need to be set and `sls` installed before you can

    cd providers/aws
    sls deploy

### Azure

Automatic deployment is not yet supported on Azure. To deploy on Azure Functions you can use the web console to create two functions with the contents of

    providers/azure/empty.js
    providers/azure/simpleInitiator.js

Use the file name (minus the extention) as the fucntion name and configure HTTP triggers for the functions.

### BlueMix

See Azure above.

### Google Cloud

Once the `gcloud` utility is installed and configured, you can use the

    providers/gcloud.js

utility to create a project, configure it to run functions and deploy functions to that project.

You can use an existing project or create a new one. Once you have a project name you must set the `GCLOUD_REGION` and `GCLOUD_PROJECT` variables accordingly.
