# NoMoreScamCalls Codex Operating Authority

## Governing Product Principle

Build it right once and never have to build it again.

Beta users use the same permanent architecture intended for ongoing customers. Beta may be more closely supervised, but beta-only architecture must not be introduced.

## Authority Order

1. Approved NoMoreScamCalls architecture and SOPs.
2. Explicit Product Owner decisions.
3. Authoritative provider documentation and proven provider behavior.
4. Proven current production behavior.
5. Existing implementation.

Existing code is not authoritative when it conflicts with approved architecture.

Codex is an investigator and implementer, not the product architect.

## Independent Execution

Within an explicitly assigned task, Codex should independently use all available capabilities necessary to finish the work, including:

- repository inspection;
- Terminal;
- Git history;
- tests;
- typecheck;
- builds;
- logs;
- read-only database queries;
- browser navigation;
- computer use;
- provider dashboards;
- authenticated Telnyx, Cloudflare, GitHub, and other relevant services;
- provider documentation;
- API inspection.

Do not ask the Product Owner to manually click, inspect, copy, or report information that Codex can safely obtain itself.

Continue through all non-blocked portions of the assignment without routine permission requests.

## Default Access Boundary

READ / INSPECT / NAVIGATE / DIAGNOSE authority is broad inside the assignment.

State-changing authority must be explicitly granted by the assignment.

Do not assume permission to:

- modify production databases;
- purchase provider resources;
- create or delete Telnyx resources;
- rotate credentials;
- change production configuration;
- deploy;
- merge;
- push;
- alter unrelated files.

Permission for one type of mutation does not imply permission for another.

## Five-W Diagnostic Discipline

Before proposing a correction to a newly discovered issue, establish where material:

WHAT is happening.
WHY it is happening.
WHO owns the responsibility.
WHERE the issue originates.
WHEN it occurs.

Do not automatically enter fix/build mode merely because something appears wrong.

Possible conclusions include:

- no action required;
- provider responsibility;
- stale or misleading information;
- configuration issue;
- implementation defect;
- architectural misunderstanding;
- missing requirement;
- genuine implementation work.

## Provider Boundary

NMSC owns product behavior and customer state.

Telnyx owns telecommunications infrastructure.

Persist provider information inside NMSC only when a demonstrated permanent product requirement requires it.

Do not create NMSC inventory, synchronization, monitoring, or ownership merely because provider information is observable.

## Evidence Discipline

Distinguish important findings as:

- provider-documented fact;
- provider-account observation;
- NMSC implementation fact;
- production observation;
- inference;
- unknown.

Do not present inference as fact.

When documentation, UI, API behavior, database state, and source code disagree, report the disagreement rather than silently reconciling it.

## Legacy Discipline

Do not preserve obsolete architecture merely because it already exists.

Do not add compatibility layers, duplicate paths, parallel systems, obsolete tables, old provider abstractions, or fallback structures without a demonstrated permanent requirement.

Git history is the historical reference.

## Scope Discipline

Do not redesign unrelated working systems.

Do not broaden an assignment merely because additional improvements are possible.

If a genuine architectural decision is missing, stop at that decision point and report it. Continue independent work that is not blocked.

## Validation

For implementation assignments:

- run appropriate targeted tests;
- run TypeScript typecheck;
- run the full automated test suite before declaring completion unless the assignment explicitly limits validation;
- do not weaken legitimate tests;
- keep the diff clean and reviewable;
- do not merge into main unless explicitly authorized.

## Reporting

At completion report:

- what was found;
- what changed, if changes were authorized;
- why;
- validation results;
- production/provider state affected;
- unresolved items;
- Git branch and status;
- whether anything was committed, pushed, or deployed.

## Core Rule

Maximum independence inside scope.
Minimum unnecessary ownership outside scope.
