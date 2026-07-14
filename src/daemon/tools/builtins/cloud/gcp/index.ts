/**
 * GCP tools -- registration aggregator.
 */

import { registerTool } from '../../../registry.js';
import { gcpStorageLsTool, gcpStorageCpTool, gcpStorageRmTool } from './storage.js';
import { gcpComputeListTool, gcpComputeStartTool, gcpComputeStopTool, gcpComputeDeleteTool } from './compute.js';
import { gcpIamWhoAmITool } from './iam.js';
import { gcpFunctionsListTool, gcpFunctionsCallTool } from './functions.js';
import { gcpRunListTool, gcpRunDeployTool, gcpRunDeleteTool } from './run.js';
import { gcpSecretsAccessTool, gcpSecretsAddTool } from './secrets.js';
import { gcpLoggingReadTool } from './logging.js';
import { gcpSqlDescribeTool, gcpSqlStartTool, gcpSqlStopTool } from './sql.js';
import { gcpContainerGetCredentialsTool } from './container.js';

export function registerGcpTools(): void {
  // Batch 1
  registerTool(gcpStorageLsTool);
  registerTool(gcpStorageCpTool);
  registerTool(gcpStorageRmTool);
  registerTool(gcpComputeListTool);
  registerTool(gcpComputeStartTool);
  registerTool(gcpComputeStopTool);
  registerTool(gcpComputeDeleteTool);
  registerTool(gcpIamWhoAmITool);
  registerTool(gcpFunctionsListTool);
  registerTool(gcpFunctionsCallTool);

  // Batch 2
  registerTool(gcpRunListTool);
  registerTool(gcpRunDeployTool);
  registerTool(gcpRunDeleteTool);
  registerTool(gcpSecretsAccessTool);
  registerTool(gcpSecretsAddTool);
  registerTool(gcpLoggingReadTool);
  registerTool(gcpSqlDescribeTool);
  registerTool(gcpSqlStartTool);
  registerTool(gcpSqlStopTool);
  registerTool(gcpContainerGetCredentialsTool);
}
