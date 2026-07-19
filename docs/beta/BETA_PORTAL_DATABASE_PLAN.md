# Beta Portal Database Plan

## Existing Tables (Remain Authoritative)

### users
Purpose:
- Subscriber identity.
- Protected phone number.
- Screening number assignment.
- SIP username assignment.
- Operational service status.

### call_events
Purpose:
- Subscriber call history.
- Portal call activity.
- Administrative reporting.

### screening_number_inventory
Purpose:
- Screening number inventory and assignment.

### sip_credential_inventory
Purpose:
- SIP credential inventory and assignment.

---

## Existing Users Table Changes

The existing `users` table remains the authoritative subscriber record.

Remove:

- `full_name`

Add:

- `first_name`
- `last_name`
- `carrier`
- `contact_method`
- `password_hash`
- `role`
- `account_status`
- `setup_status`

The existing operational fields remain unchanged:

- `phone_number`
- `screening_number`
- `sip_username`
- `status`
- `coverage_status`

`status` and `coverage_status` remain operational service fields.

`account_status` and `setup_status` remain portal lifecycle fields.

There will be no duplicate `full_name` representation and no compatibility layer.

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
- One subscriber record.
- One source of truth.
