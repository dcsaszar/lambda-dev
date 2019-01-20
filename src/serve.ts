import * as bodyParser from "body-parser";
import * as express_ from "express";
import * as requireFromString_ from "require-from-string";
import chalk from "chalk";

import build from "./build";

// typescript namespace import doesn't work with Rollup
const express = express_;
const requireFromString = requireFromString_;

const prefix = chalk.grey("λ-dev");

const handleErr = (err: Error, res: express_.Response) => {
  res.status(500).send("Function invocation failed: " + err.toString());
  return console.error(
    `${prefix} ${chalk.red("Function invocation failed:")}`,
    err
  );
};

const createCallback = (res: express_.Response) => (
  err: Error | null,
  lambdaRes: any | null
) => {
  if (err) return handleErr(err, res);

  res.status(lambdaRes.statusCode);

  for (const key in lambdaRes.headers) {
    res.setHeader(key, lambdaRes.headers[key]);
  }

  res.send(lambdaRes.body);
};

const promiseCallback = (
  promise: Promise<void>,
  callback: ReturnType<typeof createCallback>
) => {
  if (promise) {
    promise.then(res => callback(null, res)).catch(err => callback(err, null));
  }
};

type Event = {
  path: express_.Request["path"];
  httpMethod: express_.Request["method"];
  queryStringParameters: express_.Request["query"];
  headers: express_.Request["headers"];
  body: express_.Request["body"];
};

type CallbackFn = (
  error: Error | null,
  response: express_.Response | null
) => void;

type Handler = (
  event: Event,
  context: {},
  callback: CallbackFn
) => Promise<void>;

const createHandler = (
  source: string,
  filename: string
): express_.RequestHandler => (req, res) => {
  let lambda: { handler: Handler };

  try {
    lambda = requireFromString(source, filename);
  } catch (err) {
    return handleErr(err, res);
  }

  const event = {
    path: req.path,
    httpMethod: req.method,
    queryStringParameters: req.query,
    headers: req.headers,
    body: req.body
  };

  const callback = createCallback(res);
  const promise = lambda.handler(event, {}, callback);
  promiseCallback(promise, callback);
};

const getPath = (basePath: string) => {
  const path = basePath.startsWith("/") ? basePath : "/" + basePath;
  return path.endsWith("/") ? path.replace(/\/$/, "") : path;
};

// handlers for all routes
const routeHandlers: { [key: string]: express_.RequestHandler } = {};

type CreateServer = CliServeArgs & {
  dev?: boolean;
  watch?: boolean;
};

export const createServer = async ({
  basePath,
  dev = true,
  entry,
  exclude,
  include,
  node: nodeVersion,
  port,
  watch = true,
  webpackConfig: customConfig
}: CreateServer) => {
  let firstRun = true;
  const app = express();
  app.use(bodyParser.raw());
  app.use(bodyParser.text({ type: "*/*" }));

  const path = getPath(basePath);

  await build({
    callback: ({ entries, modules }) => {
      for (const lambda of entries) {
        const requestPath = path + lambda.requestPath;
        const { source } = modules.find(build =>
          build.identifier.includes(lambda.file)
        );

        // set new handler for requestPath
        routeHandlers[requestPath] = createHandler(source, lambda.file);

        if (firstRun) {
          // create route that calls handler by requestPath
          app.all(requestPath, (req, res, next) =>
            routeHandlers[requestPath](req, res, next)
          );

          console.log(
            `${prefix} Serving Function ${chalk.green(
              `http://localhost:${port}${requestPath}`
            )}`
          );
        }
      }
      firstRun = false;
    },
    dev,
    entry,
    include,
    exclude,
    node: nodeVersion,
    webpackConfig: customConfig,
    watch
  });

  return app;
};

type Serve = CliServeArgs & {
  watch?: boolean;
};

export default async ({
  basePath,
  entry,
  exclude,
  include,
  node: nodeVersion,
  port,
  watch,
  webpackConfig: customConfig
}: Serve) => {
  const app = await createServer({
    basePath,
    entry,
    exclude,
    include,
    node: nodeVersion,
    port,
    watch,
    webpackConfig: customConfig
  });

  return app.listen(port, (err: Error) => {
    if (err) {
      console.error(`${prefix} ${chalk.red("Serve error:")}`, err);
      throw err;
    } else {
      console.log(`${prefix} Serving...`);
    }
  });
};
