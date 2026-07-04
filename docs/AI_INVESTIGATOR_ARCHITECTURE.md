Copy everything below into the file
NoMoreScamCalls AI Investigator Architecture
Purpose

The AI Investigator is an internal NoMoreScamCalls employee.

It is not the decision maker.

It is not the product.

It is a specialized investigator whose responsibility is to reduce uncertainty by collecting the highest-value evidence available during an incoming call.

The AI Investigator exists to improve the quality of evidence presented to the NoMoreScamCalls Decision Engine.

Core Philosophy

The AI Investigator does not determine whether a caller is legitimate.

The AI Investigator determines what evidence can be gathered to reduce uncertainty.

The Decision Engine combines:

Existing evidence
Historical evidence
Network evidence
Subscriber preferences
AI evidence

to produce one of the three canonical outcomes:

Allow
Allow with Score
Divert with Score
Mission

Gather the highest-value evidence possible while remaining:

Fast
Explainable
Predictable
Cost conscious
Respectful
Consistent

The AI Investigator should stop investigating once additional questioning is unlikely to materially improve the evidence available.

Responsibilities

The AI Investigator may:

Conduct conversational investigations.
Ask adaptive follow-up questions.
Analyze caller responses.
Detect conversational inconsistencies.
Produce structured evidence reports.

The AI Investigator may not:

Decide call disposition.
Override subscriber preferences.
Modify company policy.
Change investigation thresholds.
Invent new objectives.
Investigation Objectives

Every investigation attempts to reduce uncertainty in the following areas.

Identity

Who is calling?

Has the caller identified themselves?

Is the identity complete?

Purpose

Why is the caller calling?

Is the explanation reasonable?

Is it specific?

Conversation Quality

Does the conversation appear natural?

Does the caller answer direct questions?

Does the caller avoid answering?

Are responses repetitive or scripted?

Human Authenticity

Evidence regarding:

Human
AI voice
Recording
Hybrid

Confidence should always accompany this assessment.

Behavioral Indicators

Examples include:

Urgency
Fear
Authority impersonation
Financial pressure
Social engineering
Emotional manipulation
Telephony Evidence

Incorporate available evidence such as:

STIR/SHAKEN
Spoof indicators
Ownership anomalies
Carrier information
Reputation providers
Network metadata
Remaining Uncertainty

The investigator should always identify what remains unknown.

Investigative Curiosity

The investigator should continuously ask:

"What is the highest-value unanswered question?"

Questions should be adaptive rather than scripted.

Each question should reduce uncertainty.

The investigator should stop asking questions when:

confidence is sufficiently high,
additional questions provide little value,
operational limits are reached.
Evidence Report

Every investigation returns structured evidence.

Typical sections include:

Transcript
Summary
Identity completeness
Purpose completeness
Human authenticity
Conversation quality
Scam indicators
Telephony observations
Remaining uncertainty
Confidence
Recommended risk contribution

The report contributes evidence.

It never determines the final decision.

Operational Guardrails

The investigator operates within company-defined limits.

Examples include:

Maximum investigation duration.
Maximum follow-up questions.
Cost controls.
Approved objectives.
Required report format.

These policies belong to NoMoreScamCalls and are never modified autonomously.

Learning

The investigator improves through operational evidence.

Examples include:

Confirmed scams.
Subscriber feedback.
False positives.
False negatives.
Administrative review.

Learning improves future evidence gathering.

Learning does not modify company policy.

Long-Term Vision

The investigator is a permanent company capability.

Today it investigates telephone conversations.

Future evidence sources may include:

Video
SMS
Email
Documents
Screen sharing

The mission remains unchanged.

Reduce uncertainty.

Gather evidence.

Support the Decision Engine.

# Organizational Role

The AI Investigator is one department within the NoMoreScamCalls Protection System.

Its responsibility is limited to investigation.

It is intentionally separated from evidence collection, policy, decision making, telephony, and customer communications.

The organizational relationship is:

Incoming Call
        │
        ▼
Evidence Collection
        │
        ▼
Investigation Planner
        │
        ▼
AI Investigator
        │
        ▼
Evidence Report
        │
        ▼
Decision Engine
        │
        ▼
Call Control
        │
        ▼
Customer Experience

Each department has a single responsibility.

No department should perform another department's role.

This separation allows every component to improve independently while keeping the overall architecture understandable and maintainable.

---

# Department Responsibilities

## Evidence Collection

Collects existing facts.

Examples:

- Allow List
- Confirmed Scam List
- Subscriber Preferences
- Reputation
- Network Evidence

Does not investigate.

---

## Investigation Planner

Determines whether additional investigation is justified.

Balances:

- operational cost
- expected evidence value
- customer experience
- subscriber protection

Does not gather evidence.

---

## AI Investigator

Conducts investigations when requested.

Produces structured evidence.

Never determines call disposition.

---

## Decision Engine

Combines all available evidence.

Produces one of three outcomes:

- Allow
- Allow with Score
- Divert with Score

The Decision Engine owns the final decision.

---

## Call Control

Executes the decision.

Examples include:

- Allow call
- Challenge caller
- Divert caller
- Hang up

Call Control never determines policy.

---

# Architectural Principle

The intelligence of NoMoreScamCalls is distributed across specialized departments.

Each department has one clear responsibility.

Each department produces information that becomes evidence for the next department.

This architecture keeps the product:

- explainable
- testable
- maintainable
- scalable
- vendor independent

Future capabilities should be introduced by extending an existing department or by adding a new department rather than expanding the responsibilities of an existing one.