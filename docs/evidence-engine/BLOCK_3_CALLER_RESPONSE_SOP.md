# Block 3 — Caller Response SOP

## Purpose

Block 3 gathers and evaluates caller-response evidence.

Block 3 processes only evidence produced during the current call.

Every caller receives the same two-prompt process.

Block 3 identifies caller-response facts and originates the approved deductions associated with those facts.

Block 3 does not calculate standing, execute IPQS, or determine routing.

---

## Trigger

Block 3 begins when it receives the completed Block 2 Evidence Box.

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
12. Produce the completed Block 3 Evidence Box.
13. Pass the completed Block 3 Evidence Box to Block 4.

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

Block 3 owns all deductions resulting from those facts.

Current approved caller-response deductions are:

- unusable or missing name: 15 points
- unusable or missing reason: 15 points

The rules are applied independently to each evidence prompt.

A prompt may therefore originate:

- 0 points of deduction
- 15 points of deduction
- 30 points of deduction

Because every caller receives two evidence prompts, caller-response deductions may total up to 60 points.

Block 3 records and passes these deductions forward.

Block 3 does not apply the deductions to a starting standing and does not calculate a current standing.

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

### Block 3 Results

- completed Block 2 Evidence Box
- Prompt 1 evidence
- Prompt 2 evidence
- total Block 3 deductions originated
- individual deduction records

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
- total Block 3 deductions originated

Every call record must use the same evidence structure, regardless of the caller’s final standing or disposition.

---

## Boundaries

Block 3 does not:

- use prior calls to judge the current call
- create caller reputation
- make allow or divert decisions
- determine final call disposition
- calculate standing
- know or apply the universal starting standing
- execute IPQS
- perform offline research
- alter Evidence Library history
- allow the Response Evaluator to control deductions
- allow the Response Evaluator to control scoring
- allow the Response Evaluator to control routing

Block 3 gathers evidence, evaluates caller-response facts, originates approved deductions, and passes the completed Evidence Box to Block 4.

Only Block 5 applies accumulated deductions, calculates standing, determines whether IPQS is required, and selects the next routing action.

---

## Error Handling

If Block 3 encounters an implementation error that prevents completion of its responsibility, the caller shall be played the standard system error message:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Immediately following the message, the call shall be disconnected.

Implementation errors are operational events only.

They are never considered caller evidence and shall not create deductions or alter any information already contained within the Evidence Box.

---

## Change Control

Prompt wording, voice, pause timing, transcription provider, Response Evaluator provider, and model selection may change without altering this SOP, provided the process and evaluator contract remain unchanged.

Any change to the two-prompt process, deduction rules, evidence structure, or Block 3 responsibilities requires an approved SOP update before code is changed.

If implementation and this SOP differ, this SOP is the authoritative source.
