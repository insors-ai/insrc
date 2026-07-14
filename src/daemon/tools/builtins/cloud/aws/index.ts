/**
 * AWS tools -- registration aggregator.
 */

import { registerTool } from '../../../registry.js';
import { awsS3LsTool, awsS3CpTool, awsS3RmTool, awsS3SyncTool } from './s3.js';
import { awsEc2ListTool, awsEc2StartTool, awsEc2StopTool, awsEc2TerminateTool } from './ec2.js';
import { awsStsWhoAmITool } from './sts.js';
import { awsLambdaInvokeTool, awsLambdaListTool, awsLambdaUpdateCodeTool } from './lambda.js';
import { awsSecretsGetTool, awsSecretsPutTool } from './secretsmanager.js';
import { awsSsmGetParameterTool, awsSsmPutParameterTool } from './ssm.js';
import { awsCfnListTool, awsCfnDeployTool, awsCfnDeleteTool } from './cloudformation.js';
import { awsEcrLoginTool } from './ecr.js';
import { awsEksListTool, awsEksUpdateKubeconfigTool } from './eks.js';
import { awsRdsDescribeTool, awsRdsStartTool, awsRdsStopTool } from './rds.js';
import { awsLogsTailTool, awsLogsFilterTool } from './logs.js';
import { awsIamListAttachedPoliciesTool } from './iam.js';

export function registerAwsTools(): void {
  // Batch 1
  registerTool(awsS3LsTool);
  registerTool(awsS3CpTool);
  registerTool(awsS3RmTool);
  registerTool(awsS3SyncTool);
  registerTool(awsEc2ListTool);
  registerTool(awsEc2StartTool);
  registerTool(awsEc2StopTool);
  registerTool(awsEc2TerminateTool);
  registerTool(awsStsWhoAmITool);
  registerTool(awsLambdaInvokeTool);

  // Batch 2
  registerTool(awsLambdaListTool);
  registerTool(awsLambdaUpdateCodeTool);
  registerTool(awsSecretsGetTool);
  registerTool(awsSecretsPutTool);
  registerTool(awsSsmGetParameterTool);
  registerTool(awsSsmPutParameterTool);
  registerTool(awsCfnListTool);
  registerTool(awsCfnDeployTool);
  registerTool(awsCfnDeleteTool);
  registerTool(awsEcrLoginTool);

  // Batch 3
  registerTool(awsEksListTool);
  registerTool(awsEksUpdateKubeconfigTool);
  registerTool(awsRdsDescribeTool);
  registerTool(awsRdsStartTool);
  registerTool(awsRdsStopTool);
  registerTool(awsLogsTailTool);
  registerTool(awsLogsFilterTool);
  registerTool(awsIamListAttachedPoliciesTool);
}
