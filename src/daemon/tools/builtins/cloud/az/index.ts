/**
 * Azure tools -- registration aggregator.
 */

import { registerTool } from '../../../registry.js';
import { azAccountShowTool } from './account.js';
import { azStorageBlobLsTool, azStorageBlobCpTool, azStorageBlobRmTool } from './storage.js';
import { azVmListTool, azVmStartTool, azVmStopTool, azVmDeleteTool } from './vm.js';
import { azKeyvaultSecretShowTool, azKeyvaultSecretSetTool } from './keyvault.js';
import { azAksListTool, azAksGetCredentialsTool } from './aks.js';
import { azFunctionAppListTool, azFunctionAppDeployTool } from './functionapp.js';
import { azMonitorLogQueryTool } from './monitor.js';
import { azSqlServerListTool, azSqlServerStartTool, azSqlServerStopTool } from './sql.js';

export function registerAzTools(): void {
  // Batch 1
  registerTool(azAccountShowTool);
  registerTool(azStorageBlobLsTool);
  registerTool(azStorageBlobCpTool);
  registerTool(azStorageBlobRmTool);
  registerTool(azVmListTool);
  registerTool(azVmStartTool);
  registerTool(azVmStopTool);
  registerTool(azVmDeleteTool);
  registerTool(azKeyvaultSecretShowTool);
  registerTool(azKeyvaultSecretSetTool);

  // Batch 2
  registerTool(azAksListTool);
  registerTool(azAksGetCredentialsTool);
  registerTool(azFunctionAppListTool);
  registerTool(azFunctionAppDeployTool);
  registerTool(azMonitorLogQueryTool);
  registerTool(azSqlServerListTool);
  registerTool(azSqlServerStartTool);
  registerTool(azSqlServerStopTool);
}
