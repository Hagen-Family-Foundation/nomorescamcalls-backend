# Constitutional Architecture Decisions

These constitutional decisions define the permanent architectural principles of NoMoreScamCalls.

Implementation may evolve.

Evidence collection may improve.

Technology may change.

These principles govern the architecture unless they are intentionally revised through an approved architectural decision.

---

# Article 1 — Product Mission

NoMoreScamCalls exists for one purpose:

> Protect subscribers from scam and unwanted telephone calls while allowing legitimate callers through as quickly as possible.

Every feature, service, and engineering decision shall directly support that mission.

The platform shall not expand beyond its intended purpose without an approved architectural revision.

---

# Article 2 — Evidence Engine

Every inbound call enters the Evidence Engine.

There are no automatic passes.

Every call is evaluated.

Every call produces evidence.

Every call concludes with a completed Evidence Box.

---

# Article 3 — Current-Call Independence

Every inbound call begins with a standing of 100.

Only objective evidence gathered during the current call may affect the live standing.

Historical information may be preserved for research but shall never determine the live outcome of another call.

---

# Article 4 — Evidence Boxes

Information moves through the Evidence Engine in completed Evidence Boxes.

Each processing block:

- receives the completed Evidence Box from the previous block,
- performs only its assigned responsibility,
- adds its completed information,
- produces a completed Evidence Box for the next block.

Evidence always moves forward.

---

# Article 5 — Block Independence

Each block is intentionally independent.

A block knows only:

- the completed Evidence Box it receives,
- its approved responsibility,
- the completed Evidence Box it must produce.

A block shall not perform responsibilities assigned to another block.

---

# Article 6 — Objective Evidence

The Evidence Engine operates solely upon objective evidence.

No deductions shall originate from:

- assumptions,
- demographics,
- political or social characteristics,
- geography alone,
- generalized caller profiles,
- speculation,
- unverified intent.

Every deduction must be traceable to an approved rule supported by observable evidence.

---

# Article 7 — Evidence Library

The Evidence Library is independent from the live Evidence Engine.

Its purpose is:

- historical preservation,
- engineering research,
- operational review,
- future analytical improvement.

The Evidence Library never changes the completed outcome of a call.

Historical evidence supports future engineering.

It never changes live call disposition.

---

# Article 8 — Subscriber Experience

Subscribers purchase protection.

They do not purchase investigative information.

Internal complexity belongs within the Evidence Engine.

The subscriber experience shall remain:

- simple,
- predictable,
- understandable,
- fast.

---

# Article 9 — Operational Errors

Implementation failures are operational events.

They are never caller evidence.

Operational failures shall not create deductions, modify standing, or alter the Evidence Box.

---

# Article 10 — Architectural Authority

Approved Standard Operating Procedures govern implementation.

When implementation and an approved SOP differ, the SOP is the authoritative source.

Development proceeds in the following order:

1. Architecture
2. Standard Operating Procedure
3. Implementation
4. Testing
5. Commit

---

# Article 11 — Architectural Replacement

The approved architecture replaces obsolete architecture.

Parallel systems, duplicate processing paths, abandoned structures, and superseded architectural models shall not remain part of the production architecture except during an approved migration.

Git history preserves previous work.

The production architecture remains clean.

---

# Article 12 — Long-Term Engineering Principles

Engineering decisions shall favor:

- simplicity,
- readability,
- maintainability,
- objective evidence,
- clear responsibility boundaries,
- long-term serviceability,
- conventional engineering practices.

The objective is to build a system that remains understandable, supportable, and reliable for many years while remaining focused exclusively on protecting subscribers from scam and unwanted telephone calls.
