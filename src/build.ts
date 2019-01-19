import * as webpack_ from "webpack";
import chalk from "chalk";

import getEntries, { Entry } from "./entries";
import getWebpackConfig from "./webpack.js";

// bad typings
const MemoryFS = require("memory-fs");
// typescript namespace import doesn't work with Rollup
const webpack = webpack_;

const prefix = chalk.grey("λ-dev");

type ResolveArgs = {
  entries: Entry[];
  hash?: string;
  modules: any[];
  warnings?: any[];
};

type RejectArgs = {
  entries: Entry[];
  error?: Error;
  errors?: any[];
  hash?: string;
};

type Callback = (
  args: { entries: Entry[]; hash?: string; modules: any[] }
) => void;

const getCallback = (
  entries: Entry[],
  resolve: (args: ResolveArgs) => void,
  reject: (args: RejectArgs) => void,
  callback?: Callback
): webpack_.Compiler.Handler => (err, stats) => {
  if (err) {
    console.error(`${chalk.grey("λ-dev")} ${chalk.red("Webpack error:")}`, err);
    reject({ entries, error: err });
  }

  const { errors, hash, modules, warnings } = stats.toJson({
    assets: true,
    errors: true,
    hash: true,
    warnings: true
  });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(
        `${chalk.grey("λ-dev")} ${chalk.red("Compilation error:")}`,
        error
      );
    }
    reject({ entries, errors, hash });
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(
        `${chalk.grey("λ-dev")} ${chalk.red("Compilation warning:")}`,
        warning
      );
    }
  }

  console.log(`${prefix} Built ${chalk.green(hash)}`);

  if (callback) {
    callback({ entries, hash, modules });
  }

  resolve({ entries, hash, modules, warnings });
};

type Build = CliBuildArgs & {
  callback?: Callback;
  dev?: boolean;
};

export default ({
  callback,
  dev = false,
  entry,
  exclude,
  include,
  node: nodeVersion,
  target: targetDir,
  watch = false,
  webpackConfig: customConfig
}: Build) =>
  new Promise<ResolveArgs>((resolve, reject) => {
    const entries = getEntries(entry, include, exclude)!;

    try {
      const config = getWebpackConfig({
        customConfig,
        dev,
        entries,
        nodeVersion,
        targetDir
      });

      const compiler = webpack(config);

      if (dev) {
        const memoryFs = new MemoryFS();
        compiler.outputFileSystem = memoryFs;
      }

      watch
        ? compiler.watch({}, getCallback(entries, resolve, reject, callback))
        : compiler.run(getCallback(entries, resolve, reject, callback));
    } catch (err) {
      console.error(`${chalk.grey("λ-dev")} ${chalk.red("Build error:")}`, err);
      reject({ entries, error: err });
    }
  });
