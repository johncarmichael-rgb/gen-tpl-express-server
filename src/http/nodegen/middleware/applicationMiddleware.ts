import { corsMiddleware, headersCaching, iapAuthMiddleware, inferResponseType } from '@/http/nodegen/middleware';
import express from 'express';
import expressFormData from 'express-form-data';
import morgan from 'morgan';
import { tmpdir } from 'os';
import requestIp from 'request-ip';
import cookieParser from 'cookie-parser';
import packageJson from '../../../../package.json';
import * as helmet from 'helmet';
import { CorsOptions } from '@/http/nodegen/middleware/corsMiddleware';

type AccessLoggerOptions = morgan.Options<express.Request, express.Response>;

export type AppMiddlewareOptions = {
  accessLogger?: AccessLoggerOptions;
  helmet?: helmet.HelmetOptions;
  cors?: CorsOptions;
};

export const responseHeaders = (app: express.Application, corsOptions?: CorsOptions): void => {
  app.use(corsMiddleware(corsOptions));
  app.use(headersCaching());
};

export const requestParser = (app: express.Application): void => {
  // parse any cookies 1st
  app.use(cookieParser());

  // parse data with connect-multiparty
  app.use(
    expressFormData.parse({
      autoClean: true,
      autoFiles: true,
      uploadDir: tmpdir(),
    }),
  );

  // clear all empty files (size == 0)
  app.use(expressFormData.format());

  // union body and files
  app.use(expressFormData.union());

  // parse the body
  app.use(express.urlencoded({ extended: false }));

  // inject the request ip to the req. object
  app.use(requestIp.mw());
};

/**
 * Apply authentication middlewares
 * IAP authentication validates JWT tokens from Google Cloud IAP
 * This must run AFTER request parsing (to access headers) but BEFORE routes
 */
export const authenticationMiddleware = (app: express.Application): void => {
  // Validate Google Cloud IAP JWT tokens
  // In production: validates x-goog-iap-jwt-assertion header
  // In development: skips validation (uses ENABLE_DEV_AUTH_BYPASS instead)
  app.use(iapAuthMiddleware());
};

export const accessLogger = (app: express.Application, accessLoggerOpts?: AccessLoggerOptions): void => {
  // A bug in the morgan logger results in IPs being dropped when the node instance is running behind a proxy.
  // The following pattern uses the requestIp middleware "req.client" and adds the response time.
  // `[${packageJson.name}] :remote-addr [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]`
  app.use(
    morgan(function (tokens, req, res) {
      return [
        '[' + packageJson.name + ']',
        req.clientIp,
        '[' + new Date().toISOString() + ']',
        '"' + tokens.method(req, res),
        tokens.url(req, res),
        'HTTP/' + tokens['http-version'](req, res) + '"',
        tokens.status(req, res),
        tokens.res(req, res, 'content-length'),
        '-',
        tokens['response-time'](req, res),
        'ms',
      ].join(' ');
    }, accessLoggerOpts),
  );
};

export const helmetMiddleware = (app: express.Application, helmetOptions?: helmet.HelmetOptions): void => {
  app.use(helmet.default(helmetOptions));
};

/**
 * Injects routes into the passed express app
 * @param app
 * @param appMiddlewareOpts
 */
export const requestMiddleware = (app: express.Application, appMiddlewareOpts?: AppMiddlewareOptions): void => {
  accessLogger(app, appMiddlewareOpts?.accessLogger);
  helmetMiddleware(app, appMiddlewareOpts?.helmet);
  requestParser(app);
  responseHeaders(app, appMiddlewareOpts?.cors);
  authenticationMiddleware(app); // Apply IAP authentication
  app.use(inferResponseType());
};
