# Beta Portal Database Plan

## Permanent Authoritative Tables

### users
Purpose:
- Customer-account identity and status.
- Email and distinct account contact phone.
- Authentication, communication preference, agreement, and onboarding state.

### account_locations
Purpose:
- Minimal administrative grouping owned by one customer account.
- Parent relationship for up to six Protected Lines.

### protected_lines
Purpose:
- Protected telephone number and exact caller-facing phrase.
- Carrier/line information.
- Screening DID and SIP-resource assignment.
- Line-specific provisioning and coverage state.
- Explicit account and Location ownership.

### call_events
Purpose:
- Subscriber call history.
- Exact Protected Line attribution.
- Portal call activity.
- Administrative reporting.

### screening_number_inventory
Purpose:
- Screening number inventory and assignment to an exact Protected Line.

### sip_credential_inventory
Purpose:
- SIP credential inventory and assignment to an exact Protected Line.

### administrative_review_sessions
Purpose:
- Preserve the authenticated reviewer user and role.
- Preserve the reviewed customer account and initial Protected Line.
- Record review start and end timestamps so duration can be calculated.

### administrative_review_events
Purpose:
- Record meaningful account-family, section, and line reads.
- Record approved administrative changes with target, field/action, and
  ordinary prior/resulting values.
- Keep secret fields and secret values out of the review audit trail.

---

## Existing Users Table Changes

The existing `users` table remains the authoritative customer-account record.

Remove:

- `full_name`

Add:

- `first_name`
- `last_name`
- `contact_phone_number`
- `contact_method`
- `password_hash`
- `role`
- `account_status`
- `setup_status`

Legacy one-line operational fields remain temporarily for safe production
transition:

- `phone_number`
- `screening_number`
- `sip_username`
- `caller_facing_business_name`
- `carrier`
- `status`
- `coverage_status`

These legacy columns are not authoritative in permanent creation,
provisioning, live-call, evidence, or portal-summary paths. New Protected Line
records own protected number, carrier, caller-facing phrase, screening DID,
SIP username, provisioning status, and coverage status.

`account_status` and `setup_status` remain account and portal lifecycle fields.
Account `setup_status` does not claim line coverage.

There will be no duplicate `full_name` representation. Existing production
one-line data is not backfilled or guessed into Locations and Protected Lines;
that transition requires a separately approved explicit mapping.

## New Portal Tables

### beta_invite_codes

Purpose:

- Control access to beta registration.
- Record code status, expiration, and use.

### portal_sessions

Purpose:

- Store revocable authenticated portal sessions.
- Link each session directly to one existing user.

### beta_agreement_acceptances

Purpose:

- Preserve each agreement acceptance as a historical business record.
- Record the user, agreement version, and acceptance timestamp.

### beta_feedback

Purpose:

- Store participant reports and observations.
- Optionally associate feedback with a call event.

---

## Design Goals

- Extend the existing backend.
- Do not duplicate subscriber records.
- Do not duplicate provisioning.
- Do not duplicate call history.
- Keep portal concerns separate from telephony operations.
- Keep operational status separate from portal/account lifecycle.
- One customer-account record with explicit Location and Protected Line children.
- One authoritative source for each concern.
- One Protected-Line provisioning service for beta and post-launch subscribers.
- Resumable onboarding on the existing subscriber record.
- No inferred caller-facing business, Location, branch, or department identity.
- Six Protected Lines per Location for every customer type.
