# Beta Portal Requirements

## Purpose

The beta portal provides controlled access to the NoMoreScamCalls beta program.

It must allow personally recruited beta participants to create an account, provide required information, accept the beta agreement, complete service setup, and view basic call activity.

It must also provide an administrative dashboard for monitoring every beta account and the overall performance of the service.

---

## Beta Access

Each beta participant receives the private registration link and the shared
four-digit beta access code. The same code is used by all personally recruited
participants. The backend validates it from the server-only
`BETA_ACCESS_CODE` configuration during registration. The code is not stored
on the account or returned by the API.

The live SMS path is not part of beta admission. Telnyx outbound SMS remains
available for exact-line forwarding instructions through
`TELNYX_API_KEY`, `TELNYX_API_BASE_URL`, `TELNYX_LIVE_EXECUTION`,
`TELNYX_MESSAGING_PROFILE_ID`, and `TELNYX_MESSAGING_FROM_NUMBER`.

The portal must:

* Require the valid shared beta access code during account creation.
* Fail closed when the server code is missing or invalid.
* Avoid persisting or returning the access code.
* Allow the beta participant to create login credentials.
* Allow the beta participant to log in and return to the portal.
* Allow an administrator to activate, suspend, or close the beta account.

---

## Beta Participant Information

The portal must collect:

* First name.
* Last name.
* Email address.
* Account contact phone number.
* Preferred contact method.
* Beta access code.
* Date the account was created.
* Account status.

The portal must allow the administrator to review and update this information.

---

## Beta Agreement

The beta participant must accept the beta agreement before the account can be activated.

The backend current-agreement endpoint is the sole active source for agreement
content, effective date, and canonical version. The portal must render that
response and submit the same version for acceptance. Administrative identities
do not retrieve or accept the beta/customer agreement as a condition of using
authorized administrative routes.

The portal must record:

* Agreement version.
* Date and time accepted.
* Name of the participant.
* Beta account associated with the acceptance.

The agreement will describe:

* The purpose of the beta program.
* The current nature of the product.
* Basic product-performance expectations.
* Possible interruptions or changes during beta testing.
* Communication expectations.
* Participant conduct.
* Privacy and data handling.
* The participant’s ability to leave the beta.
* NoMoreScamCalls’ ability to end beta participation.

---

## Service Setup

The beta account must support account email, a distinct account contact phone,
an optional explicitly approved SMS contact, preferred contact method,
authentication, agreement acceptance, and account onboarding state. The
account contact phone is for setup communication and is not assumed to be a
protected number or SMS-capable.

The beta portal uses the same permanent `Customer Account → Location →
Protected Line` model as every other enrollment source. Locations are minimal
administrative groupings and each may contain up to six Protected Lines.

Each Protected Line carries its own protected telephone number, exact
caller-facing phrase, carrier, assigned screening number, SIP resource,
provisioning state, coverage state, call-forwarding progress, test-call
status, and activation date where those workflow fields are available.

Account setup remains `onboarding_incomplete` or `onboarding_complete`.
Provisioning and coverage are line-specific: an unprovisioned line is inactive;
resource assignment makes the exact line provisioned and forwarding-pending,
but coverage remains inactive. Coverage becomes active only after the customer
confirms forwarding for that exact line. Sibling lines are unaffected.

Suspension and closure remain account context rather than a parallel
provisioning workflow. Forwarding guidance exposes the
line-specific screening number but never SIP credentials. Delivery uses the
explicit SMS destination when available and email otherwise; provider absence
or failure must not be presented as successful delivery. In the present live
scope, an email selection is recorded as provider-unavailable rather than sent.

---

## Beta Participant Dashboard

The participant dashboard must display:

* Account onboarding and service status.
* Locations and Protected Lines, identifiable primarily by protected telephone number.
* Per-line assigned screening number and coverage state.
* Total calls handled.
* Successful calls.
* Diverted calls.
* Date and time of the most recent call.
* A way to contact NoMoreScamCalls regarding product behavior or performance.

The beta dashboard does not require finished graphics, videos, savings estimates, blog features, or polished subscriber materials.

---

## Administrator Dashboard

The administrator dashboard must provide a system-wide view of all beta accounts.

It must display:

* Total beta accounts.
* Active accounts.
* Accounts still in setup.
* Suspended accounts.
* Total calls handled.
* Total successful calls.
* Total diverted calls.
* Calls handled today.
* Recent system activity.

For each beta account, it must display:

* Participant name.
* Email address.
* Account contact information and onboarding status.
* Each Location and its Protected Lines.
* Per-line protected number, assigned screening number, carrier, provisioning state, and coverage state.
* Account status.
* Setup status.
* Activation date.
* Last call date and time.
* Total calls.
* Successful calls.
* Diverted calls.

The administrator must be able to open an individual account and review its activity.

All customer/account review must enter through the single authenticated
administrative review gate. A valid portal session for an `admin` or
`administrator` establishes reviewer identity. Resolving any Protected Line
returns its parent account, every Location, and every sibling Protected Line,
with the initial target clearly marked. The gate records review-session start
and end, meaningful sections and lines viewed, and approved write actions with
ordinary before/after values. It must not store passwords, session tokens,
keys, credentials, or other secrets in the review audit trail.

---

## Individual Account Activity

Each beta account must provide an activity view containing:

* Call identifier.
* Call date and time.
* Successful or diverted status.
* Final standing.
* Current processing status.
* Operational error status, when applicable.

The administrator dashboard must use system records as the primary source of product-performance information.

Beta participant emails and feedback supplement the system records but do not replace them.

---

## Beta Communication

The portal must provide a clear method for participants to report:

* Calls that should have connected but did not.
* Calls that connected but should not have.
* Setup problems.
* Delivery problems.
* Unexpected product behavior.
* General observations.

Each report should include:

* Participant account.
* Date and time submitted.
* Related call date or call identifier, when known.
* Participant comments.
* Administrative follow-up status.

---

## Backend Readiness

Emergent must structure the portal so that its temporary template data can be replaced with live NoMoreScamCalls backend data.

The portal must be ready to connect to backend functions for:

* Beta code validation.
* Account creation.
* Login and authentication.
* Agreement acceptance.
* Subscriber provisioning.
* Screening-number assignment.
* Account activation.
* Call totals.
* Successful-call totals.
* Diverted-call totals.
* Recent call activity.
* Administrative account management.

The interface must not depend permanently on hard-coded users, sample call records, or demonstration totals.

---

## Beta Scope

The beta portal is intended to provide:

* Controlled beta access.
* Basic subscriber setup.
* Agreement acceptance.
* Basic participant call reporting.
* Administrative account monitoring.
* Ongoing product-performance visibility.

Finished consumer onboarding, Grace’s video, weekly blog delivery, estimated financial-loss avoidance, estimated time savings, and other polished subscriber features are outside the initial beta portal.
