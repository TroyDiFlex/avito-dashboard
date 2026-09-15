import type { Issue } from './model';

const HIDDEN_ISSUE_CODES = new Set(['year-inferred']);
const RECOVERABLE_ROW_ISSUE_CODES = new Set([
  'identity',
  'layout',
  'duplicate',
]);

export function isBlockingIssue(issue: Issue): boolean {
  return (
    issue.severity === 'error' && !RECOVERABLE_ROW_ISSUE_CODES.has(issue.code)
  );
}

export function describeIssue(issue: Issue): string {
  const location = [
    issue.source,
    issue.row ? `строка ${issue.row}` : '',
    issue.branch ?? '',
    issue.end ?? '',
  ].filter(Boolean);
  return `${location.join(' · ')}: ${issue.message}`;
}

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
