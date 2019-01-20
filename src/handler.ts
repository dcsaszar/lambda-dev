import * as express from "express";
import * as requireFromString_ from "require-from-string";

// typescript namespace import doesn't work with Rollup
const requireFromString = requireFromString_;

const createCallback = (res: express.Response, next: express.NextFunction) =>
  function callback(err: Error | null, lambdaRes: any | null) {
    if (err) {
      return next(err);
    }

    res.status(lambdaRes.statusCode);
    for (const key in lambdaRes.headers) {
      res.setHeader(key, lambdaRes.headers[key]);
    }
    res.send(lambdaRes.body);
  };

async function promiseCallback(
  promise: Promise<void>,
  callback: ReturnType<typeof createCallback>
) {
  try {
    const res = await promise;
    callback(null, res);
  } catch (error) {
    callback(error, null);
  }
}

type Event = {
  path: express.Request["path"];
  httpMethod: express.Request["method"];
  queryStringParameters: express.Request["query"];
  headers: express.Request["headers"];
  body: express.Request["body"];
};

type CallbackFn = (
  error: Error | null,
  response: express.Response | null
) => void;

type Handler = (
  event: Event,
  context: {},
  callback: CallbackFn
) => Promise<void>;

const createHandler = (
  source: string,
  filename: string
): express.RequestHandler =>
  function handler(req, res, next) {
    try {
      let lambda: { handler: Handler } = requireFromString(source, filename);

      const event = {
        path: req.path,
        httpMethod: req.method,
        queryStringParameters: req.query,
        headers: req.headers,
        body: req.body
      };

      const callback = createCallback(res, next);
      const promise = lambda.handler(event, {}, callback);
      promiseCallback(promise, callback);
    } catch (error) {
      throw error;
    }
  };

export default createHandler;
