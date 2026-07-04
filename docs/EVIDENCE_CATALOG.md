# EVIDENCE_CATALOG.md

## Purpose

The Evidence Catalog is the authoritative inventory of every evidence source available to NoMoreScamCalls.

Its purpose is to document:

* What evidence can be collected.
* Which department is responsible for collecting it.
* How the evidence reduces uncertainty.
* The expected confidence of the evidence.
* The current implementation status.

The catalog intentionally does **not** define company policy or decision thresholds.

The Decision Engine determines how evidence is evaluated.

The catalog only documents what observations are available.

---

# Evidence Philosophy

NoMoreScamCalls is an evidence-driven system.

Every capability should answer one question:

> **What uncertainty does this evidence reduce?**

Evidence is collected to improve understanding—not to justify predetermined decisions.

Multiple pieces of evidence are often stronger than any single observation.

---

# Evidence Sources

## Allow List

**Department**

Baseline Evidence

**Purpose**

Provides strong positive evidence that the subscriber has previously approved this caller.

**Reduces Uncertainty**

* Whether the subscriber already trusts the caller.

**Confidence**

High

**Implementation Status**

Implemented

---

## Subscriber Block List

**Department**

Baseline Evidence

**Purpose**

Provides subscriber-specific evidence that this caller is unwanted.

**Reduces Uncertainty**

* Whether the subscriber has previously requested that future calls be diverted.

**Confidence**

High

**Implementation Status**

Implemented

---

## Confirmed Scam Database

**Department**

Baseline Evidence

**Purpose**

Provides system-wide evidence that a caller has been confirmed as fraudulent.

**Redduces Uncertainty**

* Whether the caller has previously met the company's scam evidence threshold.

**Confidence**

High

**Implementation Status**

Implemented

---

## Reputation History

**Department**

Baseline Evidence

**Purpose**

Tracks historical calling behavior observed by NoMoreScamCalls.

**Reduces Uncertainty**

* Frequency of activity.
* Behavioral trends.
* Prior observations.

**Confidence**

Medium

**Implementation Status**

Implemented

---

## STIR/SHAKEN Validation

**Department**

Baseline Evidence

**Purpose**

Evaluates caller authentication information provided by the telephone network.

**Reduces Uncertainty**

* Authenticity of caller identity presentation.

**Confidence**

Medium

**Implementation Status**

Planned

---

## IPQS Intelligence

**Department**

Baseline Evidence

**Purpose**

Collects external reputation information for telephone numbers.

**Reduces Uncertainty**

* Known abuse indicators.
* Reputation history outside the platform.

**Confidence**

Medium

**Implementation Status**

Planned

---

## Identity Investigation

**Department**

AI Investigator

**Purpose**

Collects evidence supporting or contradicting the caller's claimed identity.

**Reduces Uncertainty**

* Whether the caller appears consistent with the identity being presented.

**Confidence**

Variable

**Implementation Status**

Planned

---

## Conversation Quality

**Department**

AI Investigator

**Purpose**

Observes conversational characteristics rather than relying solely on transcript content.

Examples include:

* Responsiveness
* Consistency
* Directness
* Scripted behavior
* Evasion

**Reduces Uncertainty**

* Whether the caller behaves like a legitimate human conversation.

**Confidence**

Variable

**Implementation Status**

Planned

---

## Human Presence

**Department**

AI Investigator

**Purpose**

Determines whether a live person appears to be participating.

Possible observations include:

* Live conversation
* Recording
* Voice synthesis
* Automated system

**Reduces Uncertainty**

* Whether meaningful investigation is possible.

**Confidence**

Variable

**Implementation Status**

Planned

---

## Adaptive Questioning

**Department**

AI Investigator

**Purpose**

Selects the next question that is expected to reduce uncertainty the most.

Questions are not scripted.

They adapt to the evidence already collected.

**Reduces Uncertainty**

* Missing identity information.
* Missing contextual information.
* Inconsistent responses.

**Confidence**

Variable

**Implementation Status**

Planned

---

# Future Evidence Sources

Potential future evidence sources include:

* SMS investigations
* Email investigations
* Video investigations
* Document analysis
* Screen sharing
* Device reputation
* Behavioral history across communication channels

These capabilities follow the same philosophy:

Collect evidence.

Reduce uncertainty.

Support the Decision Engine.

---

# Guiding Principle

Evidence exists to reduce uncertainty.

The AI Investigator contributes evidence.

The Decision Engine evaluates evidence.

No evidence source is the decision maker.

NoMoreScamCalls remains an evidence-first system.
