/**
 * Cloud tools -- provider aggregator.
 *
 * One entry point per cloud (aws, gcp, az). Each provider's index.ts
 * groups its service tools (s3, ec2, ...). The daemon's builtins
 * aggregator calls registerCloudTools() once.
 */

import { registerAwsTools } from './aws/index.js';
import { registerGcpTools } from './gcp/index.js';
import { registerAzTools } from './az/index.js';

export function registerCloudTools(): void {
  registerAwsTools();
  registerGcpTools();
  registerAzTools();
}
