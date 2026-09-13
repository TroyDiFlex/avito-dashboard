import type { Issue } from './model';

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
      issueBelongsToBranches(issue, branches) &&
      (!issue.end || !from || !to || (issue.end >= from && issue.end <= to)),
  );
}
