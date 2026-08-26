# NoMoreScamCalls Product Architecture

## Purpose

NoMoreScamCalls is an evidence-driven call protection service.

Its mission is:

> Keep scammers and unwanted callers away from subscribers while allowing legitimate callers through as quickly as possible.

The product screens every inbound call before it reaches the subscriber.

The system evaluates the current call using objective evidence gathered during that call. It does not grade people, predict intent, or rely on assumptions.

---

## Product Scope

NoMoreScamCalls exists solely to protect subscribers from scam and unwanted telephone calls.

The platform is not:

- a voicemail service
- a general communications platform
- a messaging service
- a caller investigation service
- a historical reputation engine controlling live calls

Every feature must directly support call protection, subscriber activation, operational reliability, or evidence-based improvement of the service.

---

## Evidence Engine

The live screening system is called the Evidence Engine.

Every inbound call enters the Evidence Engine.

There are no automatic passes.

Each call is evaluated independently using evidence from that call.

Previous calls do not determine the standing, deductions, or disposition of the current call.

Historical information may be preserved for future analysis, but it does not control live screening.

---

## Evidence Boxes

Information moves through the Evidence Engine in Evidence Boxes.

Each block:

1. Receives the completed Evidence Box from the preceding block.
2. Performs only the responsibilities assigned to its approved SOP.
3. Adds its completed information to the Evidence Box.
4. Passes the completed Evidence Box to the next block.

Each block is intentionally isolated.

A block knows only:

- the Evidence Box it receives
- its own assigned responsibility
- the Evidence Box or record it must produce

A block does not perform work assigned to another block.

---

## Block 1 — Call Intake

Block 1 begins when Telnyx notifies the platform of a new inbound call.

Block 1 receives:

- inbound call information
- the Telnyx call record
- billing timer information

Block 1 places this information into the Block 1 Evidence Box and passes the completed box to Block 2.

Block 1 performs no screening, scoring, evidence evaluation, deduction, or routing.

The governing document is:

`docs/evidence-engine/BLOCK_1_CALL_INTAKE_SOP.md`

---

## Block 2 — Telnyx Screening

Block 2 begins when it receives the completed Block 1 Evidence Box.

Every call begins Block 2 with a standing of 100.

Block 2 receives the screening information produced by Telnyx, including:

- calling-number information
- STIR/SHAKEN information
- CNAM information
- carrier and line-lookup information

Block 2 places the starting standing and Telnyx screening information into the Block 2 Evidence Box and passes the completed box to Block 3.

Block 2 does not interpret or modify the information received from Telnyx.

Block 2 does not assign deductions, gather caller responses, perform IPQS, determine disposition, or route the call.

The governing document is:

`docs/evidence-engine/BLOCK_2_TELNYX_SCREENING_SOP.md`

---

## Block 3 — Caller Response

Block 3 owns the caller-response process.

NoMoreScamCalls is operationally present but invisible to callers. Caller-facing prompts present only the protected business's identity and never identify NoMoreScamCalls, screening, scoring, or evidence collection.

Each Protected Line stores an explicit customer-selected `caller_facing_business_name`. The customer chooses the exact wording announced for that line. This value is distinct from legal, billing, invoice, account-holder, owner, location, department, and other formal names and is never inferred, rewritten, or decorated with them.

A Protected Line cannot be provisioned or activate coverage until this value has been explicitly supplied. No generic, inferred, or unbranded fallback identity is permitted. If an incoming call resolves a line that lacks the value, live handling stops with HTTP `409` and reason `caller_facing_business_name_unavailable` before any caller-facing prompt is issued.

The incoming screening number resolves the exact Protected Line, then its owning customer account, and carries that line's stored caller-facing business name into Block 3.

The initial request is:

> "Thank you for calling [CALLER-FACING BUSINESS NAME]. Please say your name and reason for calling so that we may route your call appropriately. Thank you."

Block 3 captures, records, transcribes, and evaluates the caller's response.

The live scoring rules evaluate the value and completeness of the information supplied during each response:

- Prompt 1 missing or unusable name: 8-point deduction
- Prompt 1 missing or unusable reason: 12-point deduction
- Prompt 2 missing or unusable name: 10-point deduction
- Prompt 2 missing or unusable reason: 15-point deduction
- approved complementary crossed responses: one 5-point complete-response-deficiency deduction

When the first response is insufficient, Block 3 may perform the approved second-prompt process.

The second request is:

> "Our apologies. Please speak clearly with your name and reason for calling so we may route your call to the correct department."

No more than two requests are made.

Each caller-response window closes after five continuous seconds without a new accepted final Telnyx transcription segment. Each accepted final segment restarts that five-second silence interval.

For a failed call, Block 3 targets unavailable-message playback for approximately 48 seconds after call start. A failure determined at or after that target begins playback immediately, including after second 59. The complete caller message takes precedence over avoiding another billed minute. Normal correlated playback completion finalizes the call immediately; if that completion is missing, a single 20-second safety timer measured from Telnyx speak acceptance finalizes it.

Block 3 preserves the caller-response evidence, deductions, transcripts, recording references, and evaluation results inside the Evidence Box.

### IPQS

IPQS is used only after Prompt 2 when the standing after all caller-response deductions and recoveries is between 76 and 85 inclusive.

- standing 86–100: no IPQS lookup
- standing 76–85: request the approved IPQS evidence
- standing 75 or below: no IPQS lookup

IPQS does not supply a score or disposition to NoMoreScamCalls. Only the approved evidence fields may contribute the existing NoMoreScamCalls-defined deductions. NoMoreScamCalls calculates the final standing and applies its existing routing threshold.

Block 3 completes its responsibility and passes the completed Block 3 Evidence Box to Block 4.

The governing document is:

`docs/evidence-engine/BLOCK_3_CALLER_RESPONSE_SOP.md`

---

## Block 4 — Evidence Delivery

Block 4 begins after Block 3 has completed the live call and recording.

Block 4 receives the completed Block 3 Evidence Box.

Block 4 delivers the complete Evidence Box to the Evidence Library.

Block 4 does not inspect, change, separate, rename, interpret, sort, store, or index the evidence.

The Evidence Library receives the completed Evidence Box and performs its own sorting, placement, storage, and indexing.

The governing document is:

`docs/evidence-engine/BLOCK_4_EVIDENCE_LIBRARY_SOP.md`

---

## Telnyx Responsibility

Telnyx provides the telephony infrastructure used during the call.

Its responsibilities include:

- receiving the inbound call
- creating the Telnyx call record
- initiating the billing timer
- providing available telephony screening information
- executing call-control instructions
- connecting approved calls to the subscriber endpoint
- maintaining and completing the call media
- producing the call recording when recording is enabled

Telnyx does not receive the completed Evidence Box.

Block 4 does not hand the Evidence Box to Telnyx.

After the call ends and the recording is made available, Telnyx has no further responsibility for that call.

Its next operational responsibility begins when it receives the next inbound call.

---

## Evidence Library

The Evidence Library is separate from the live Evidence Engine.

Its purpose is historical storage, categorization, and future analytical research.

At the end of each call, Block 4 sends the completed Evidence Box to the Evidence Library.

The completed Evidence Box contains the available call information accumulated across Blocks 1 through 4, including:

- call identity
- Telnyx call information
- billing and timing information
- Telnyx screening information
- starting standing
- caller prompts
- caller responses
- transcripts
- response evaluation results
- deductions
- IPQS findings when applicable
- final standing
- routing result
- call completion information

The Telnyx call recording is a separate artifact.

The Evidence Library stores the completed Evidence Box without waiting for the recording.

When the recording becomes available, it is retrieved from Telnyx and associated with the correct Evidence Library record using the matching Telnyx call identifier or call-session identifier.

The archived call may therefore move through two storage states:

1. Evidence Box received; recording pending.
2. Evidence Box and recording complete.

The Evidence Library does not modify the outcome of a completed call.

Historical analysis may inform future engineering decisions, but historical records do not alter the live standing or disposition of another call.

---

## Observation Mode

Caller-side audio may be observed and recorded during the screening process.

Observation begins during the active call and continues until transfer or disconnection.

Observable information may include:

- requested responses
- unsolicited statements
- silence
- timing
- background audio
- other objectively measurable call characteristics

Observation does not permit speculation.

Research information that is not part of approved live scoring is preserved for later analysis only.

---

## Current-Call Evidence Rule

Every live deduction must originate from objective evidence gathered during the current call.

The system does not apply deductions based on:

- assumptions
- demographics
- geography alone
- political or social characteristics
- unverified intent
- prior call behavior
- historical reputation
- generalized caller profiles

Every deduction must be traceable to an approved rule and preserved in the Evidence Box.

---

## Operational Error Handling

Implementation failures are operational events.

They are not caller evidence.

When an implementation error prevents the call from completing normally, the caller hears:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

The call is then disconnected.

Operational failures do not alter standing or create caller deductions.

---

## Customer Account, Location, and Protected-Line Lifecycle

NoMoreScamCalls uses one permanent structure for beta participants, production
businesses, residential customers, and future subscribers:

`Customer Account → Location → Protected Line`

The existing `users` row is the authoritative customer account. It owns
identity, email, account contact phone, preferred communication method,
authentication, agreement acceptance, onboarding state, and account status.
It is not itself a protected telephone line. Account contact information may
differ from every protected number and must not be assumed to support SMS.

Completed account onboarding requires first name, last name, email address,
account contact phone, preferred contact method, password credential, and
acceptance of the current required agreement. It does not require a protected
number, carrier, caller-facing phrase, screening DID, or SIP credential.

Each account may own multiple minimal administrative Locations. Each Location
may contain at most six Protected Lines. The six-line technical capacity is
uniform across customer and enrollment types and is unrelated to pricing.
Locations do not imply geographic routing, branding, department labels, or a
centralized multi-location call-distribution system.

Each Protected Line owns its protected phone number, exact caller-facing
phrase, carrier information, screening DID, SIP credential, provisioning
state, coverage state, Location relationship, and customer-account
relationship. New lines start `unprovisioned` with inactive coverage.

Provisioning rechecks account onboarding and the exact line's eligibility,
then reserves one available Telnyx screening DID and one available SIP
credential from the approved inventories for that Protected Line. Only that
line becomes `provisioned` with active coverage. Other lines under the account
are untouched. Partial reservations are released after failure, and retrying
an already provisioned line is idempotent.

`account_status` controls account lifecycle and portal access. Account
`setup_status` records account onboarding completion. Coverage claims are
line-specific. A completed account may add and provision later lines without
re-registering or repeating the agreement, except when the agreement system
legitimately requires acceptance of a newer active version.

Legacy one-line columns on `users` remain temporarily for safe production
transition only. They are not authoritative in the permanent creation,
provisioning, live-call, evidence, or dashboard paths. Existing production
rows are not guessed into Locations or Protected Lines; their explicit
transition requires a separate approved mapping decision.

---

## Administrative Account Review

Administrative, support, and compliance customer review enters through one
controlled `POST /admin/review` gate. The gate uses the existing authenticated
portal bearer session and permits only the established `admin` and
`administrator` roles. Reviewer user ID and role are preserved on the review
session; no separate IAM or parallel support/compliance lookup road exists.

The gate accepts exact account or Protected-Line identifiers already present
in the permanent architecture and resolves them internally. A Protected-Line
target always expands to its parent Customer Account, all account Locations,
and every sibling Protected Line. The initial line remains marked in the
family output. Family visibility does not combine line provisioning, coverage,
screening DID, caller-facing phrase, SIP ownership, calls, or evidence.

Each authorized entry creates or uses one `administrative_review_sessions`
record. Meaningful family, section, and line views create
`administrative_review_events` read records. Approved changes through the same
gate create write records containing the target, field/action, prior value,
and resulting value. Passwords, tokens, keys, credentials, and other secrets
are not review-writable and are never copied into the audit trail.

Session start and end timestamps provide review duration without scoring,
inferring motive, or judging reviewer behavior. Customer self-service and
non-review operational provisioning, telephony, evidence, and diagnostics
remain separate from administrative customer review.

---

## Subscriber Experience

The subscriber experience remains intentionally simple.

Subscribers receive:

- automatic screening
- rapid connection of qualifying calls
- protection from scam and unwanted calls
- a predictable service experience

Subscribers are insulated from:

- internal standing
- deductions
- evidence evaluation
- IPQS processing
- routing logic
- Evidence Library research
- internal system complexity

The subscriber purchases protection, not investigative data.

---

## Engineering Authority

The approved SOP for each block is the authoritative implementation source.

The required development order is:

1. Architecture
2. SOP
3. Implementation
4. Tests
5. Commit

If implementation conflicts with an approved SOP, the SOP governs and the implementation must be corrected.

Obsolete architectures, duplicate processing paths, abandoned stage models, and parallel systems are not retained inside the current Evidence Engine.

---

## Governing Principles

- Every inbound call enters the Evidence Engine.
- Every call begins with a standing of 100.
- Every call is evaluated independently.
- Only current-call evidence affects live deductions.
- Each block performs one defined responsibility.
- Evidence moves forward through completed Evidence Boxes.
- Approved calls are connected promptly.
- Unsuccessful calls complete the observation path, including the complete unavailable message, and then disconnect promptly.
- Block 4 sends the completed Evidence Box to the Evidence Library.
- Telnyx recordings are associated with the archived call after they become available.
- Historical evidence supports research and engineering, not live-call control.
- The product remains focused solely on scam and unwanted-call protection.
