export interface ResponseValidationIssue {
 readonly code: string;
 readonly field: string;
 readonly correction: string;
 readonly message?: string | undefined;
}
