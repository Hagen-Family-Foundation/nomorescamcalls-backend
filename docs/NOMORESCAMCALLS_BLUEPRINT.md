# NoMoreScamCalls Blueprint — How It's Built

_Last updated: 2026-07-01_

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
6. Backend provisions the account:
   - subscriber record,
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
→ forwarded to Telnyx screening DID
→ Telnyx Call Control webhook
→ Cloudflare Worker
→ screening engine
→ allow / challenge / block decision
→ approved calls delivered to SIP/WebRTC endpoint
→ customer receives clean call experience

## Proven Production Milestone

On 2026-07-01, the production call path was successfully validated:

- real caller: +1 816-718-6960,
- production user id: 6,
- production screening number: +1 913-956-2493,
- SIP username: usersupport15892,
- allow-list bypass worked,
- Telnyx live transfer executed,
- Linphone rang,
- two-way audio worked,
- normal hangup succeeded,
- MOS reported 4.50,
- live execution returned to false.

This proves the core production routing architecture is viable.

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

## Admin-Only Data

Admin systems may expose:

- detailed call events,
- caller reputation,
- challenge outcomes,
- blocked/diverted caller data,
- scam intelligence,
- provisioning state,
- failed transfers,
- Telnyx audit events,
- operational health,
- investigation evidence.

This information is not customer-facing.

## Onboarding Strategy

The onboarding process intentionally asks for useful starting data so protection begins with a stronger foundation.

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

- live Telnyx execution is normally disabled,
- `TELNYX_LIVE_EXECUTION=false` is the safe default,
- enable live execution only for deliberate controlled tests,
- disable immediately afterward.

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
- Avoid parallel old/new code paths unless temporarily required for migration.
- Keep the codebase lean, readable, conventional, and maintainable.
- Build for reliability, efficiency, effectiveness, strength, and scalability.
- Do not expand product scope beyond scam-call protection.
- If a feature does not improve protection, activation, trust, or operational reliability, defer it.

## Beta Priority

The immediate objective is beta readiness as soon as possible.

Beta must validate:

- onboarding flow,
- call-forwarding activation,
- live allow path,
- live challenge path,
- blocked/scam path,
- dashboard value display,
- customer confidence,
- operational monitoring.

July 7 is a drop-dead beta date, not the target. Sooner is better.

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

This changes the voice-analysis problem.

The primary problem is no longer how to capture the caller's voice.

The primary problem is how to reliably retrieve the correct recording by call_session_id and use it for transcription and analysis.

## Voice Evidence Architecture Direction

The long-term challenge flow should move away from keypad input.

The caller should hear only:

"Please state your name and reason for calling."

The system should then use the resulting voice evidence for future analysis.

The preferred correlation key is Telnyx call_session_id because it appears in:

- live Call Control webhook events,
- challenge events,
- bridge/transfer events,
- hangup events,
- Telnyx recording records.

The next architecture brick is to determine whether recordings can be fetched directly or deterministically by call_session_id.

If proven, the future flow becomes:

Incoming call
→ screen
→ challenge if needed
→ caller states name and reason
→ recording is retrieved by call_session_id
→ recording is transcribed
→ transcript and voice evidence are analyzed
→ final risk decision
→ transfer or terminate

This follows the permanent project rule:

The evidence will tell us what to do next.
We only use evidence as our guide.
We do not use anything else.

## 2026-07-01 Recording Correlation Proof

Production evidence proved that Telnyx recordings can be matched back to live call events by call_session_id.

The Worker now supports a recordings diagnostic query:

/telnyx/recordings?call_session_id=<call_session_id>

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
→ call_session_id
→ Telnyx recording
→ MP3 download URL

This is the backbone for the future spoken-caller analysis flow.

The immediate beta-focused meaning is:

NoMoreScamCalls does not need to prove basic call control or audio capture anymore before beta planning can continue.

Those bricks are proven.

The remaining work should now focus on getting the service safe, understandable, supportable, and testable for real beta users.

From this point forward, next-step decisions should be evaluated by one question:

Does this help get NoMoreScamCalls into the hands of beta testers safely and with evidence?

## 2026-07-01 Recording Correlation Proof

Production evidence proved that Telnyx recordings can be matched back to live call events by call_session_id.

The Worker now supports a recordings diagnostic query:

/telnyx/recordings?call_session_id=<call_session_id>

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
→ call_session_id
→ Telnyx recording
→ MP3 download URL

This is the backbone for the future spoken-caller analysis flow.

The immediate beta-focused meaning is:

NoMoreScamCalls does not need to prove basic call control or audio capture anymore before beta planning can continue.

Those bricks are proven.

The remaining work should now focus on getting the service safe, understandable, supportable, and testable for real beta users.

From this point forward, next-step decisions should be evaluated by one question:

Does this help get NoMoreScamCalls into the hands of beta testers safely and with evidence?
