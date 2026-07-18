# Architectural Revision: Evidence Engine & Master Operational Blueprint

## Purpose

NoMoreScamCalls has evolved beyond a traditional call screening platform.

The system is now architected as an **Evidence Engine** whose first application is protecting subscribers from scam and unwanted telephone calls.

The mission of the product remains unchanged:

> **Keep scammers and unwanted callers away from subscribers while allowing legitimate callers through as quickly as possible.**

The method by which that mission is accomplished has matured significantly.

The platform no longer makes decisions from isolated observations. Instead, it continuously gathers objective evidence, compares newly observed behavior against previously established facts, and determines whether the accumulated evidence satisfies the required threshold for the call to proceed.

---

# The Master Operational Blueprint

The Master Operational Blueprint is the canonical operational reference for NoMoreScamCalls.

It serves as the primary reference for:

* Product architecture
* Backend implementation
* Engineering documentation
* Onboarding
* Beta operations
* Sales training
* Support documentation
* Future architectural decisions

As the product evolves through Beta, revisions should refine the contents of each operational stage while preserving the overall structure of the Blueprint whenever practical.

The Blueprint is the authoritative representation of how the platform operates.

---

# Evidence Relationship Model

The most significant architectural advancement is the transition from independent evaluation stages to a continuous evidence relationship model.

Earlier concepts viewed Stage 1 and Stage 2 as separate scoring events.

That model has been replaced.

Stage 1 establishes objective facts.

Stage 2 gathers live behavioral evidence.

Those two bodies of evidence are continuously compared throughout the screening process.

The relationships between them become evidence themselves.

The platform does not rely upon isolated observations.

Evidence gains meaning through its consistency—or inconsistency—with other evidence already established.

---

# Stage 1 – Objective Evidence

Stage 1 establishes known facts before behavioral evaluation begins.

Examples include, but are not limited to:

* Calling Number
* STIR/SHAKEN verification
* CNAM information
* IPQS intelligence
* Carrier and line characteristics
* Historical evidence
* Existing reputation

Stage 1 remains active throughout the entire screening process.

These facts are never discarded once behavioral collection begins.

---

# Stage 2 – Behavioral Evidence

Version 1 behavioral collection begins with a single request:

> "Please state your name and reason for calling."

Only two pieces of information are requested.

The platform is not attempting to conduct an interview.

Instead, it observes how the caller responds.

Behavioral evidence may include willingness to respond, response quality, consistency with known facts, hesitation, unsolicited statements, environmental observations, or any other objectively observable behavior.

No assumptions are made.

Only observed evidence is considered.

---

# Second Opportunity

If sufficient behavioral evidence is not obtained during the initial request, the caller is given a second opportunity.

The platform plays:

> "Please hold while I try to connect you."

After a brief observation period, the original request is repeated without modification.

The wording does not change.

The purpose is not clarification.

The purpose is to obtain an additional behavioral measurement under naturally evolving circumstances.

---

# Passive Observation

Passive observation is an intentional architectural component of the Evidence Engine.

During these periods the platform stops requesting information and simply observes naturally occurring behavior.

Potential observations may include:

* Silence
* Unsolicited remarks
* Frustration
* Conversations with nearby individuals
* Environmental characteristics
* Attempts to influence the system
* Any other objectively observable behavior

The platform records observations without speculation or assumption.

Future Beta evidence will determine the long-term value assigned to each observation type.

---

# Universal Screening

Every inbound call enters the Evidence Engine.

There are no automatic passes.

There are no exempt callers.

Every call receives evidence collection.

Every call receives evaluation.

Every call receives a score.

The score alone determines whether the call satisfies the required threshold for release.

---

# Call Release

When a call satisfies the required evidence threshold, the platform immediately releases the call toward its intended destination.

At that point, the platform's responsibility for that specific call is complete.

The platform does not manage conversations.

It does not participate in completed calls.

Its purpose is to determine whether sufficient evidence exists for the call to continue.

---

# Continued Observation

Calls that fail to satisfy the required evidence threshold remain under observation.

These calls continue generating evidence until the screening process concludes.

This represents the primary area of engineering interest because unsuccessful calls provide the greatest opportunity for improving future evidence collection and evaluation.

---

# Subscriber Experience

The subscriber experience remains intentionally simple.

Subscribers receive:

* Automatic scam call screening
* Rapid connection for legitimate callers
* Protection from unwanted callers
* A straightforward and predictable experience

Subscribers are intentionally insulated from:

* Internal scoring
* Evidence relationships
* Behavioral deductions
* Decision logic
* AI reasoning
* System complexity

Complexity belongs inside the Evidence Engine—not in the subscriber experience.

---

# Beta Philosophy

Beta is an evidence gathering program.

Its purpose is to refine evidence weighting, improve behavioral interpretation, and validate operational assumptions using measurable real-world results.

Beta is not intended to redefine the architectural principles described in this document.

The architecture remains stable while evidence continuously improves the quality of future decisions.

---

# Permanent Engineering Principles

The following principles govern the long-term evolution of NoMoreScamCalls:

* Evidence is collected continuously throughout the screening process.
* Evidence is never interpreted in isolation.
* Relationships between objective facts and observed behavior determine the strength of the evidence.
* Every inbound call is evaluated.
* Every inbound call receives a score.
* Calls meeting the required threshold are immediately released.
* Calls failing to meet the required threshold remain under observation until the process concludes.
* The platform's responsibility ends once a qualifying call is released.
* Engineering effort should focus primarily on understanding and improving the evaluation of calls that fail the evidence threshold.
* Complexity belongs within the Evidence Engine while the subscriber experience remains simple, fast, and understandable.

This revision establishes the Evidence Engine and the Master Operational Blueprint as the permanent architectural foundation upon which future versions of NoMoreScamCalls will be built.
