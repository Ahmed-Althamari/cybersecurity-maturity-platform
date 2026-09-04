export interface FrameworkValidationIssue {
  path: string;
  message: string;
}

export class FrameworkValidationError extends Error {
  readonly issues: FrameworkValidationIssue[];

  constructor(issues: FrameworkValidationIssue[]) {
    super(
      `Invalid framework definition: ${issues.map((issue) => `${issue.path} - ${issue.message}`).join('; ')}`,
    );
    this.name = 'FrameworkValidationError';
    this.issues = issues;
  }
}
