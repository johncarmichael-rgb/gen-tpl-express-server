import dotenv from 'dotenv';
import { ProcEnvHelper } from 'proc-env-helper';
import { IAPConfig } from '@/http/nodegen/middleware/iapAuthMiddleware';


dotenv.config();

/**
 * Add and remove config that you need.
 * Centralizing config into a single file.
 * Import this config file into your code opposed to hiding process.env everywhere.
 */
export default {
  // Instance
  env: ProcEnvHelper.getOrSetDefault('NODE_ENV', 'production'),
  port: ProcEnvHelper.getOrSetDefault('PORT', 8080),

  // Logger mode - Controls console.log verbosity
  // This is not another customer logger package, use console.<method> directly
  // Options: 'error', 'warn', 'info', 'log', 'debug', 'verbose'
  // Each level includes all higher priority levels (e.g., 'info' includes 'error' and 'warn')
  loggerMode: ProcEnvHelper.getOrSetDefault('LOGGER_MODE', 'development'),

  // Google Cloud IAP Authentication
  iap: {
    enabled: ProcEnvHelper.requiredOrThrow('IAP_ENABLED'),
    projectNumber: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_NUMBER', ''),
    projectId: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_ID', ''),
    backendServiceId: ProcEnvHelper.getOrSetDefault('GCP_BACKEND_SERVICE_ID', ''),

    /**
     * This is in place due to the complexities of mocking the Google Cloud IAP Authentication locally.
     *
     * APPLIES ONLY WHEN: iap=false AND env=develop AND devAutoSeed=true
     *
     * It will automatically when the above is true:
     *   1. Seed the database with a DEV user
     *   2. Automatically create a session for any API request for the DEV user
     *
     * It will NOT automatically do anything else.
     */
    devAutoSeed: {
      enabled: ProcEnvHelper.getOrSetDefault('IAP_DEV_AUTO_SEED', false),
      user: {
        email: 'dev@temp-local-only.invalid',
        name: 'Joe Dev User'
      }
    },
  } as IAPConfig,
};
