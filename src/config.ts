import dotenv from 'dotenv';
import { ProcEnvHelper } from 'proc-env-helper';


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

  // Cors white list of URLs
  corsWhiteList: ProcEnvHelper.getOrSetDefault('CORS_WHITELIST', '*'),

  // Google Cloud IAP Authentication
  iap: {
    enabled: ProcEnvHelper.getOrSetDefault('IAP_ENABLED', false),
    projectNumber: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_NUMBER', ''),
    projectId: ProcEnvHelper.getOrSetDefault('GCP_PROJECT_ID', ''),
    backendServiceId: ProcEnvHelper.getOrSetDefault('GCP_BACKEND_SERVICE_ID', ''),
  },
};
