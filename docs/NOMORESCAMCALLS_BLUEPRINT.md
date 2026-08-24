# NoMoreScamCalls Blueprint — How It's Built

_Last updated: 2026-07-18_

## Mission

NoMoreScamCalls is a security service that protects subscribers from scam and unwanted phone calls.

The product is not a voicemail app, messaging app, call-history app, or general communications platform.

The customer experience should remain simple: the subscriber continues using their phone normally, while NoMoreScamCalls quietly reduces scam-call interruptions.

## Core Product Rule

The service exists to separate legitimate calls from scam or unwanted calls before they reach the subscriber.

Everything in the product should support one of these goals:

- get the customer protected,
- keep the customer protected,
- demonstrate the value of protection,
- let the customer manage trust decisions only they can make.

## Customer Journey

1. Customer visits NoMoreScamCalls.com.
2. Landing page explains the service.
3. Grace, the guided video/AI assistant, explains the product and reassures the customer.
4. Customer proceeds to onboarding and payment.
5. Customer enters helpful starting information:
   - trusted/good numbers,
   - numbers they want diverted,
   - relevant phone/carrier information.
6. Backend provisions the already-created subscriber account:
   - Telnyx screening number,
   - SIP/routing identity,
   - user-scoped lists.
7. Customer receives confirmation by email or text.
8. Grace/AI guides the customer through carrier call-forwarding setup.
9. Customer forwards their existing phone number to the assigned Telnyx screening number.
10. System verifies coverage is active.
11. Customer continues using their normal phone experience.
12. Customer may later view dashboard metrics and manage allowed callers.

## Call Forwarding Reality

NoMoreScamCalls cannot directly enable forwarding inside the customer’s carrier account.

The customer, helper, family member, or onboarding assistant must complete call forwarding using carrier-specific instructions.

The system should provide guided help based on:

- phone type,
- carrier,
- assigned Telnyx screening number,
- customer comfort level.

## Core Call Path

Carrier phone number

→ forwarded to the assigned Telnyx screening DID

→ Telnyx Call Control webhook

→ Cloudflare Worker

→ Evidence Engine Block 1

→ completed Block 1 Evidence Box

→ Evidence Engine Block 2

→ completed Block 2 Evidence Box

→ Evidence Engine Block 3

→ completed Block 3 Evidence Box

→ Evidence Engine Block 4

→ completed Evidence Box and deterministic routing outcome

A released call is delivered to the subscriber immediately.

A call assigned to observation remains connected through the approved observation period, receives the unavailable message at approximately 55 seconds, and is terminated before 60 seconds.

Block 4 sends the completed Evidence Box to the Evidence Library.

Telnyx does not receive the Evidence Box.

Telnyx completes the live call, produces the recording, and then waits for the next inbound call.

When the recording later becomes available, it is correlated by `call_session_id` and associated with the already archived Evidence Box.

## Proven Production Milestone

On 2026-07-01, the production call path was successfully validated:

- real caller: +1 816-718-6960,
- production user id: 6,
- production screening number: +1 913-956-2493,
- SIP username: usersupport15892,
- allow-list bypass worked under the production architecture active at that time,
- Telnyx live transfer executed,
- Linphone rang,
- two-way audio worked,
- normal hangup succeeded,
- MOS reported 4.50,
- live execution returned to false.

The allow-list bypass result is preserved as historical production evidence.

It is not part of the approved Evidence Engine architecture. Under the approved architecture, every inbound call enters the Evidence Engine and is evaluated.

This milestone proves the core production routing architecture is viable.

## Customer Dashboard Philosophy

The customer dashboard is a protection dashboard, not a call log.

Customers may see:

- total calls handled,
- total calls diverted,
- value of avoided interruptions,
- estimated time saved,
- estimated risk avoided,
- their own allow list,
- simple service status.

Customers should not see:

- individual caller phone numbers,
- blocked caller identities,
- detailed call logs,
- internal scoring,
- why a specific call was blocked,
- scam intelligence,
- reputation signals,
- admin investigation data.

Reason:

The customer buys protection, not investigative data. Detailed operational intelligence is a security and liability concern.

## Customer-Managed Data

Customers may manage:

- their own allow list,
- submissions of numbers they believe should be allowed,
- submissions of numbers they want diverted.

Customers do not directly control global scam classification.

## List Policy

There are three important list concepts:

### Allow List

User-specific. Contains callers the subscriber wants to receive.

### Local Block / Personal Divert List

User-specific. Contains callers this subscriber does not want to receive.

This can include personal nuisance callers, family disputes, co-workers, or suspected scammers.

These entries do not automatically apply to other subscribers.

### Global Confirmed Scam List

System-wide. Only legitimate scammers verified through evidence and vetting should be promoted globally.

One user’s complaint must not automatically poison the global system.

These lists preserve subscriber preferences and administrative knowledge.

They do not replace current-call evidence.

Under the approved Evidence Engine architecture:

- every inbound call still enters the Evidence Engine,
- no list creates an automatic pass,
- historical information does not alter the starting standing,
- only objective evidence from the current call produces live deductions,
- subscriber-specific preferences do not create system-wide caller reputation.

## Admin-Only Data

Admin systems may expose:

- archived Evidence Boxes,
- objective evidence collected during each call,
- deductions originated by the responsible blocks,
- final standing,
- final disposition,
- IPQS trigger and findings when applicable,
- recording references,
- transcript references,
- provisioning state,
- operational errors,
- failed transfers,
- Telnyx audit events,
- system health.

This information is operational and administrative only.

It is not customer-facing.

## Onboarding Strategy

The onboarding process intentionally asks for useful starting data so protection begins with a stronger foundation.

Completed onboarding requires the customer to supply the exact caller-facing business name they want announced to inbound callers. Account activation and subscriber provisioning cannot complete without that explicit value. It is never inferred from a personal, legal, billing, invoice, account, or other identity, and no generic or unbranded fallback is permitted.

The permanent onboarding highway uses one authoritative `users` record for
beta and post-launch subscribers. The record begins with inactive coverage and
may be resumed as the customer supplies missing information. Completion
requires first name, last name, email, protected phone number, carrier,
preferred contact method, password credential, the explicit caller-facing
business name, and acceptance of the current required agreement.

The lifecycle is:

`onboarding_incomplete / coverage inactive`

→ `onboarding_complete / coverage inactive`

→ screening DID and SIP credential assigned to the existing user

→ `provisioned / coverage active`

Provisioning does not create a user. It uses the common screening-number and
SIP-credential inventories for every enrollment source. Coverage becomes
active only when both resources belong to the same subscriber. A failed
attempt leaves the existing record inactive and recoverable; an already
provisioned subscriber is not provisioned again.

This may take time for seniors because of typing and phone-number entry.

In-person sales presentations may include helpers who sit with seniors and assist with onboarding.

This is a feature of the sales/service model, not a flaw.

## Grace / AI Assistant Role

Grace and the AI assistant exist to reduce friction and increase trust.

They help with:

- product explanation,
- onboarding guidance,
- carrier-specific call-forwarding instructions,
- activation confidence,
- answering setup questions.

The AI assistant is not the core product. The core product is scam-call protection.

## Monthly Confidence Touchpoint

Customers may receive a timely text before recurring billing.

Purpose:

- remind them of upcoming payment,
- reinforce transparency,
- point them back to the dashboard,
- show value delivered,
- maintain confidence and reduce churn.

This should be handled respectfully and sparsely.

## Backend Architecture

Current backend:

- Cloudflare Worker,
- TypeScript,
- D1 database,
- Telnyx Call Control,
- Telnyx SIP/Credential Connection,
- Vitest test suite.

Important behavior:

- live Telnyx execution is normally disabled outside deliberate live operation,
- `TELNYX_LIVE_EXECUTION=false` is the safe development and testing default,
- enable live execution only for deliberate controlled tests or approved production operation,
- return it to the appropriate safe state immediately after controlled testing.

## Production Evidence Rule

For live testing and production work, current production facts must come from production sources:

- remote D1,
- current Worker config,
- current Telnyx settings,
- current audit logs.

Do not rely on memory, old handoff notes, old tests, or stale fixtures for production facts.

## Test Data Rule

Test phone numbers must be obviously synthetic and must not resemble current or retired production values.

Known convention:

- test fixtures should use clearly synthetic `+1800555xxxx` style values,
- test SIP users should use `test_user_...`,
- retired production numbers must not remain scattered through tests.

Any `555` or old simulation number is test-only unless explicitly proven otherwise.

## Engineering Principles

- Evidence first.
- Verify from source.
- Do not fix symptoms; identify and replace the faulty circuit.
- Do not preserve obsolete or parallel architecture without an approved temporary migration purpose.
- Keep the codebase lean, readable, conventional, and maintainable.
- Build for reliability, efficiency, effectiveness, strength, and scalability.
- Do not expand product scope beyond scam-call protection.
- If a feature does not improve protection, activation, trust, or operational reliability, defer it.
- Approved architecture comes before SOPs.
- Approved SOPs come before implementation.
- Implementation must be tested before commit.
- Operational failures are never caller evidence.

## Beta Priority

The immediate objective is to prepare the approved Evidence Engine and surrounding service for controlled beta deployment.

Beta must validate:

- onboarding flow,
- call-forwarding activation,
- live Evidence Engine processing,
- spoken evidence collection,
- deterministic routing,
- release handling,
- conditional IPQS handling,
- observation handling,
- unavailable-message timing,
- termination before 60 seconds,
- Evidence Box archival,
- asynchronous recording association,
- dashboard value display,
- customer confidence,
- operational monitoring.

Each beta milestone should increase confidence in production readiness through measurable evidence.

## Market-Facing Product Direction

The public experience should be:

- appealing,
- sparse,
- clean,
- security-styled,
- confidence-building,
- senior-friendly,
- not cluttered with technical detail.

The market-facing app/site should communicate protection, trust, simplicity, and guided assistance.

## 2026-07-01 Voice Application and Recording Evidence

Production evidence proved that the Worker must point to the active Telnyx Voice Application:

- active Voice Application: NoMoreScamCalls WebRTC POC 2
- active Voice Application ID: 2974360803492235067
- webhook: https://nomorescamcalls-backend.smokey831831.workers.dev/webhooks/telnyx

The stale beta Voice Application was removed from Telnyx, and the Worker configuration was updated to the active Voice Application ID.

Production evidence also proved that caller audio recordings already exist.

The Telnyx Recordings API returned completed recordings for live calls, including:

- recording id,
- call session id,
- call leg id,
- caller number,
- screening number,
- recording start time,
- recording end time,
- duration,
- MP3 download URL.

This changed the voice-evidence problem.

The primary problem is no longer how to capture the caller’s voice.

The primary recording problem is how to retrieve the correct recording reliably by `call_session_id` and associate it with the completed archived Evidence Box.

## Voice Evidence Architecture Direction

The caller hears the customer-selected protected-business identity stored during onboarding:

> Thank you for calling [CALLER-FACING BUSINESS NAME]. Please say your name and reason for calling so that we may route your call appropriately. Thank you.

The spoken response becomes evidence for the current call.

The approved live architecture does not wait for the completed Telnyx recording before determining the call disposition.

The live flow is:

Incoming call

→ Evidence Engine Blocks 1 through 4

→ current-call evidence collected

→ deductions originated by the responsible blocks

→ deductions passed forward without applying global standing outside the approved decision responsibility

→ final standing and deterministic disposition produced

→ call released or retained through observation

→ completed Evidence Box sent to the Evidence Library

The recording flow is separate and asynchronous:

Telnyx completes the live call

→ Telnyx produces the recording

→ the recording becomes available after live processing

→ the recording is retrieved or located using `call_session_id`

→ the recording reference is associated with the existing archived Evidence Box

The Evidence Box is not sent to Telnyx.

The live call is not delayed while waiting for the recording.

The recording completes the historical archive after the live Evidence Engine has finished its work.

The permanent project rule remains:

> The evidence will tell us what to do next.
>
> We use objective evidence as our guide.
>
> We do not use assumptions.

## 2026-07-01 Recording Correlation Proof

Production evidence proved that Telnyx recordings can be matched back to live call events by `call_session_id`.

The Worker now supports a recordings diagnostic query:

`/telnyx/recordings?call_session_id=<call_session_id>`

This returned the correct completed recording for the live test call, including:

- recording id,
- call_session_id,
- call_leg_id,
- caller number,
- screening number,
- duration,
- recording start and end timestamps,
- MP3 download URL.

This proves the core correlation path:

live call event

→ `call_session_id`

→ Telnyx recording

→ MP3 download URL

This is the backbone of the asynchronous recording-association process.

The immediate beta-focused meaning is:

NoMoreScamCalls does not need to prove basic call control or audio capture again before beta planning can continue.

Those bricks are proven.

The remaining work should focus on making the service safe, understandable, supportable, and testable for real beta users.

From this point forward, next-step decisions should be evaluated by one question:

Does this help get NoMoreScamCalls into the hands of beta testers safely and with evidence?
