import type { Issue } from './model';

const HIDDEN_ISSUE_CODES = new Set(['year-inferred']);

export function issueBelongsToBranches(
  issue: Issue,
  branches: readonly string[],
): boolean {
  return !issue.branch || branches.includes(issue.branch);
}

export function filterIssues(
  issues: readonly Issue[],
  branches: readonly string[],
  from?: string,
  to?: string,
): Issue[] {
  return issues.filter(
    (issue) =>
      !HIDDEN_ISSUE_CODES.has(issue.code) &&
      issueBelongsToBranches(issue, branches) &&
      (!issue.end || !from || !to || (issue.end >= from && issue.end <= to)),
  );
}
