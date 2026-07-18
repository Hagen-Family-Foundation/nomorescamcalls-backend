# Architecture Decisions — July 4, 2026

## Product Identity

NoMoreScamCalls is an evidence-driven call protection platform.

It is **not** an AI investigation platform.

Its mission is singular:

> Keep as many scammers and unwanted callers away from subscribers as humanly possible while allowing legitimate callers through whenever possible.

Every internal capability exists solely to fulfill that promise.

---

## Core Decision Philosophy

The platform grades **calls**, not people.

Every call is evaluated using available evidence.

The Decision Engine produces one of three outcomes:

* Allow
* Allow with Score
* Divert with Score

The Decision Engine is the only component responsible for determining call disposition.

---

## Historical Standing

Every previously unseen number begins with a standing of **100**.

Returning numbers begin with their previously earned standing.

Automatic scoring may only reduce a number's standing.

A standing may only be improved through verified administrative review, such as confirmed telephone number reassignment or other verified circumstances.

---

## Passive Evidence First

Every incoming call undergoes passive evidence collection before any conversational interaction occurs.

Passive evidence may include:

* Subscriber lists
* Historical standing
* Confirmed scam history
* Network authentication
* Reputation services
* Telephony information
* Other objective evidence available before opening the line

The objective is to make the best possible decision before engaging the caller.

---

## Metadata vs. Behavioral Evidence

NoMoreScamCalls distinguishes between two categories of information.

### Metadata

Metadata is collected and preserved.

Examples include:

* Geographic information
* Carrier
* Time of call
* Previous encounter count
* Network identifiers
* Telephony identifiers

Metadata primarily supports:

* Historical analysis
* Pattern recognition
* Administrative review
* Lawful investigative requests

Metadata does not automatically affect a call's score.

### Behavioral Evidence

Behavioral observations may affect scoring.

Behavior represents what the caller actually does during the interaction.

Behavior is scored because it directly contributes to evaluating the quality of the current call.

**Guiding Principle**

> Metadata informs. Behavior scores.

---

## Conversational Screening

Conversation is opened only when passive evidence leaves sufficient uncertainty.

Version 1 uses a single request:

> "Please state your name and reason for calling."

The objective is to obtain the highest-value information using the simplest possible interaction.

Conversation is not intended to conduct an investigation.

It exists only to gather additional evidence when passive evidence alone is insufficient.

---

## Objective Scoring

Version 1 scoring is intentionally simple.

Only objective observations receive deductions.

No subjective interpretation is used.

Scoring values may be adjusted only after operational evidence demonstrates that a different value improves performance.

Evidence—not opinion—drives scoring changes.

---

## Intelligence Collection Mode

When a call reaches a divert decision, that decision is final.

The platform immediately enters **Intelligence Collection Mode**.

During this phase the system may:

* Listen to inbound audio.
* Generate transcripts when possible.
* Capture timing information.
* Record disconnect behavior.
* Preserve available metadata.
* Archive intelligence for future analysis.

Nothing collected during Intelligence Collection Mode changes the outcome of the current call.

Its purpose is to improve future decisions and expand the platform's historical intelligence.

At the conclusion of the collection interval, the caller hears the standard message:

> "I'm sorry, but the person you are calling is unavailable at this time. Please try your call again. Goodbye."

This message intentionally provides no indication that the caller has interacted with a screening system.

---

## Operational Principles

Every call is evaluated.

Every decision is evidence-based.

Every deduction must be objective.

Metadata is preserved.

Behavior is scored.

The platform never teaches callers how to defeat its screening methods.

The evidence tells us what to change.

The product remains intentionally simple for subscribers while internal capabilities evolve only when supported by operational evidence.

---

## Guiding Principle

> Collect broadly. Score narrowly.

Preserve information that may become valuable later.

Score only information that has demonstrated value in distinguishing legitimate calls from unwanted or fraudulent calls.

This philosophy keeps NoMoreScamCalls understandable, maintainable, and focused on its core promise.
