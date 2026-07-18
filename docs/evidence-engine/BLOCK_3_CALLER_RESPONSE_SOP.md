# Block 3 — Caller Response SOP

## Purpose

Block 3 gathers and evaluates caller-response evidence, originates the approved caller-response deductions, calculates the caller’s standing, performs IPQS when required, and produces the completed Block 3 Evidence Box containing the final standing.

Block 3 processes only evidence produced during the current call.

Every caller receives the same two-prompt process.

Block 3 does not route the call.

---

## Trigger

Block 3 begins when it receives the completed Block 2 Evidence Box.

The completed Block 2 Evidence Box contains the universal starting standing of 100.

---

## Standard Operating Procedure

1. Receive the completed Block 2 Evidence Box.
2. Play Evidence Prompt 1.
3. Record the caller’s response.
4. Transcribe the recorded response.
5. Submit the transcript to the Response Evaluator.
6. Store the Prompt 1 evidence:
   - audio recording reference
   - transcript
   - evaluator result
   - deductions originated by Block 3
7. Play Evidence Prompt 2.
8. Record the caller’s response.
9. Transcribe the recorded response.
10. Submit the transcript to the Response Evaluator.
11. Store the Prompt 2 evidence:
    - audio recording reference
    - transcript
    - evaluator result
    - deductions originated by Block 3
12. Combine all deductions received in the completed Block 2 Evidence Box with all deductions originated by Block 3.
13. Calculate the standing by subtracting the accumulated deductions from the starting standing of 100.
14. Clamp the standing at a minimum of 0.
15. Determine whether IPQS is required:
    - standing 86–100: do not perform IPQS
    - standing 76–85: perform IPQS
    - standing 0–75: do not perform IPQS
16. When IPQS is required:
    - submit the approved current-call lookup
    - preserve the IPQS findings
    - originate any approved IPQS deduction
    - add the IPQS deduction to the accumulated deductions
    - recalculate the standing
    - clamp the standing at a minimum of 0
17. Record the final standing.
18. Produce the completed Block 3 Evidence Box.
19. Pass the completed Block 3 Evidence Box to Block 4.

---

## Response Evaluator Contract

The Response Evaluator receives one transcript.

### Input

- transcript

### Output

- usable name: yes or no
- usable reason: yes or no

The Response Evaluator performs no deductions, scoring, standing calculation, routing, disposition, IPQS execution, or recommendations.

It returns only whether the transcript contains a usable name and a usable reason.

The transcript remains part of the preserved evidence and does not need to be recreated or summarized by the evaluator.

---

## Empty or Unusable Transcript

When a transcript is empty or contains no usable response:

- usable name is no
- usable reason is no
- the Response Evaluator does not need to be called when the absence of a transcript is already known

The approved Block 3 deduction rules are then applied normally by Block 3.

---

## Block 3 Deduction Responsibility

The Response Evaluator identifies facts only.

Block 3 owns all deductions resulting from caller-response facts.

Current approved caller-response deductions are:

- unusable or missing name: 15 points
- unusable or missing reason: 15 points

The rules are applied independently to each evidence prompt.

A prompt may therefore originate:

- 0 points of deduction
- 15 points of deduction
- 30 points of deduction

Because every caller receives two evidence prompts, caller-response deductions may total up to 60 points.

Block 3 records every individual deduction.

---

## Standing Calculation

Block 3 receives the starting standing of 100 from the completed Block 2 Evidence Box.

Block 3 calculates the current standing using all accumulated deductions from the current call.

The standing calculation is:

> Starting standing of 100 minus all accumulated approved deductions.

The standing shall never be less than 0.

Block 3 records:

- starting standing
- accumulated deductions before IPQS
- standing before IPQS
- IPQS requirement
- IPQS findings when applicable
- IPQS deduction when applicable
- accumulated deductions after IPQS
- final standing

---

## IPQS Responsibility

IPQS is conditional current-call evidence.

Block 3 performs IPQS only when the standing after caller-response deductions is between 76 and 85 inclusive.

### Standing 86–100

- IPQS is not performed.
- The standing becomes the final standing.

### Standing 76–85

- IPQS is performed.
- The IPQS findings are preserved.
- Any approved derogatory IPQS deduction is originated and applied.
- The standing is recalculated.
- The recalculated standing becomes the final standing.

### Standing 0–75

- IPQS is not performed.
- The standing becomes the final standing.

IPQS never uses prior-call history to alter the current call.

---

## Evidence Stored

Every call produces the same Block 3 evidence structure.

### Evidence Prompt 1

- audio recording reference
- transcript
- usable name result
- usable reason result
- deductions originated by Block 3

### Evidence Prompt 2

- audio recording reference
- transcript
- usable name result
- usable reason result
- deductions originated by Block 3

### Standing Results

- starting standing
- deductions received from prior blocks
- deductions originated by Block 3
- accumulated deductions before IPQS
- standing before IPQS
- IPQS required: yes or no
- IPQS findings when applicable
- IPQS deduction when applicable
- accumulated deductions after IPQS
- final standing

### Block 3 Results

- completed Block 2 Evidence Box
- Prompt 1 evidence
- Prompt 2 evidence
- individual deduction records
- total caller-response deductions
- IPQS evidence when applicable
- final standing

---

## Evidence Library

The completed Block 3 evidence is preserved for the Evidence Library.

The Evidence Library receives:

- Prompt 1 audio
- Prompt 1 transcript
- Prompt 1 evaluation
- Prompt 2 audio
- Prompt 2 transcript
- Prompt 2 evaluation
- Block 3 deduction records
- total caller-response deductions
- standing before IPQS
- IPQS trigger and findings when applicable
- IPQS deduction when applicable
- final standing

Every call record must use the same evidence structure, regardless of the caller’s final standing or routing outcome.

---

## Output

The completed Block 3 Evidence Box contains:

- the completed Block 2 Evidence Box
- all caller-response evidence
- all deductions accumulated during the current call
- IPQS evidence when applicable
- the final standing

Block 3 passes the completed Block 3 Evidence Box directly to Block 4.

---

## Boundaries

Block 3 does not:

- use prior calls to judge the current call
- create caller reputation
- make assumptions about caller intent
- perform offline research
- alter Evidence Library history
- allow the Response Evaluator to control deductions
- allow the Response Evaluator to control scoring
- allow the Response Evaluator to control routing
- execute Telnyx routing actions
- connect the caller to the subscriber
- retain or terminate the call based on routing rules

Block 3 gathers caller-response evidence, originates approved deductions, calculates standing, performs conditional IPQS processing, records the final standing, and passes the completed Evidence Box to Block 4.

Block 4 alone performs routing.

---

## Error Handling

If Block 3 encounters an implementation error that prevents completion of its responsibility, the caller shall be played the standard system error message:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Immediately following the message, the call shall be disconnected.

Implementation errors are operational events only.

They are never considered caller evidence and shall not create deductions or alter any information already contained within the Evidence Box.

---

## Change Control

Prompt wording, voice, pause timing, transcription provider, Response Evaluator provider, IPQS provider, and model selection may change without altering this SOP, provided the approved process and responsibility boundaries remain unchanged.

Any change to the two-prompt process, deduction rules, standing calculation, IPQS thresholds, evidence structure, or Block 3 responsibilities requires an approved SOP update before code is changed.

If implementation and this SOP differ, this SOP is the authoritative source.

---

## IPQS Implementation Prerequisite

The architecture establishes that Block 3 performs IPQS only when the standing before IPQS is between 76 and 85 inclusive.

Before IPQS code is implemented, the following must be expressly approved and documented:

- the IPQS input contract
- the IPQS findings structure
- the objective findings that may originate deductions
- the exact deduction value for each approved finding
- timeout and provider-error handling
- the evidence fields preserved in the completed Block 3 Evidence Box

No implementation may invent these rules.

Until those rules are approved, the IPQS portion of Block 3 remains architecturally defined but not implementation-ready.
