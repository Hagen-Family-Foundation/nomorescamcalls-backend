# Block 3 — Caller Response SOP

## Purpose

Block 3 handles the live caller interaction.

Block 3:

- starts and controls the recording
- works with Telnyx, OpenAI, and IPQS
- gathers and labels the evidence produced by each source
- applies all approved deductions
- calculates the final standing
- connects or diverts the call
- ends the recording
- passes the completed evidence to Block 4

Block 3 processes only evidence from the current call.

---

## Trigger

Block 3 begins when it receives the completed Block 2 evidence.

The Telnyx destination screening number resolves the protected subscriber account. Onboarding requires the customer to choose the exact `caller_facing_business_name` announced to callers and stores it as a dedicated value on that account. The value is distinct from legal, billing, invoice, account-holder, owner, and other formal names. It is never inferred from those fields and flows with the resolved subscriber identity into Block 3.

The field is mandatory for completed onboarding, account activation, and subscriber provisioning. Existing records may remain unset only while incomplete and must receive an explicitly customer-selected value before activation. No generic, inferred, or unbranded fallback is permitted. If live resolution finds the value missing, processing stops before caller-facing playback with HTTP `409` and reason `caller_facing_business_name_unavailable`.

NoMoreScamCalls is operationally present but caller-facing invisible. Prompts identify only the protected business and do not disclose NoMoreScamCalls, a third-party provider, screening, scoring, or evidence collection.

---

## Recording

Recording begins immediately when Block 3 starts.

The recording captures:

- the first request
- the caller’s response
- background audio
- periods with no caller speech
- the second request when required
- the caller’s second response when required
- the unavailable message when the call is diverted

Recording continues until the call leaves the control of NoMoreScamCalls.

Recording ends:

- when the call is connected to the subscriber
- or after the unavailable message is played and the diverted call is disconnected

---

## First Request

Telnyx plays:

> "Thank you for calling [CALLER-FACING BUSINESS NAME]. Please say your name and reason for calling so that we may route your call appropriately. Thank you."

Telnyx captures the caller’s response.

OpenAI evaluates the response.

OpenAI returns:

- name accepted: yes or no
- reason accepted: yes or no
- the extracted name when present
- the extracted reason when present
- the response information produced by the approved OpenAI evaluation

OpenAI does not apply deductions, calculate standing, or control the call.

---

## First Response Deductions

Block 3 applies:

- name not accepted: 8 points
- reason not accepted: 12 points

Each result is independent.

---

## Complete First Response

When the first response produces:

- name accepted: yes
- reason accepted: yes

Block 3:

1. applies no caller-response deductions
2. does not make the second request
3. does not perform IPQS
4. connects the call to the subscriber
5. ends the recording when the call leaves NoMoreScamCalls control
6. completes and labels the evidence
7. passes the completed evidence to Block 4

---

## Incomplete First Response

When either part of the first response produces no:

1. Block 3 applies the approved 8-point name deduction and/or 12-point reason deduction.
2. Recording continues.
3. Block 3 waits for 5 continuous seconds without new recognized caller speech.
4. Each new final Telnyx transcription segment counts as recognized caller speech and restarts the 5-second period.
5. Interim transcription does not close the response and does not restart the 5-second period.
6. Background noise that does not produce recognized caller speech does not restart the 5-second period.
7. After 5 continuous seconds without a new final Telnyx transcription segment, Block 3 closes the first response and Telnyx plays the second request.
8. Prompt 1 incompleteness does not trigger IPQS.

---

## Second Request

Telnyx plays:

> "Our apologies. Please speak clearly with your name and reason for calling so we may route your call to the correct department."

Telnyx captures the caller’s second response.

The second response uses the same 5-second caller-silence interval. Each accepted final Telnyx transcription segment restarts the interval, and Block 3 closes the second response after 5 continuous seconds without another accepted final segment.

OpenAI evaluates the second response using the same approved requirements used for the first response.

---

## Second Response Scoring

Block 3 applies the Prompt 2 results independently for name and reason.

- name not accepted in Prompt 2: 10 points
- reason not accepted in Prompt 2: 15 points

For each field:

- Prompt 1 fail followed by Prompt 2 pass redeems the corresponding Prompt 1 deduction.
- Prompt 1 fail followed by Prompt 2 fail retains the Prompt 1 deduction and originates the Prompt 2 deduction.
- Prompt 1 pass followed by Prompt 2 fail originates the Prompt 2 deduction.
- Prompt 1 pass followed by Prompt 2 pass leaves no deduction for that field.

No partial deductions or partial recovery are used.

## Complete-Response Deficiency

Block 3 applies exactly one additional 5-point complete-response-deficiency deduction only for either complementary crossed-response pattern:

- Prompt 1 name fail/reason pass followed by Prompt 2 name pass/reason fail
- Prompt 1 name pass/reason fail followed by Prompt 2 name fail/reason pass

This is neither a name deduction nor a reason deduction. It records that neither response contained both requested pieces of information together. It does not apply to any other response pattern.

---

## IPQS

IPQS is considered only after Prompt 2 evaluation, Prompt 1 redemption, Prompt 2 deductions, and any approved complete-response-deficiency deduction.

- standing 86–100: no IPQS request
- standing 76–85: request the approved IPQS evidence
- standing 75 or below: no IPQS request

An incomplete Prompt 1 does not itself trigger IPQS.

The complete IPQS response is preserved.

Only these IPQS fields affect the live standing:

- `valid`
- `active`
- `recent_abuse`
- `spammer`

Block 3 applies 5 points for each negative result:

- `valid = false`: 5 points
- `active = false`: 5 points
- `recent_abuse = true`: 5 points
- `spammer = true`: 5 points

A positive result applies 0 points.

A `null` result applies 0 points.

An unavailable or failed IPQS request applies 0 points.

Each approved IPQS field is scored independently.

The maximum IPQS deduction is 20 points.

IPQS does not determine disposition and does not supply a score to NoMoreScamCalls. Block 3 uses only the approved evidence fragments above, applies the NoMoreScamCalls-defined deductions, calculates the final standing, and uses the existing 76-point NoMoreScamCalls release threshold.

---

## Final Standing

Block 3 calculates the final standing after:

- Block 2 deductions
- first-response deductions
- second-response recovery
- second-response deductions
- the complete-response-deficiency deduction when applicable
- approved IPQS deductions

The calculation is:

> Starting standing of 100 minus all remaining approved deductions.

The standing cannot be less than 0.

---

## Call Completion

### Final Standing 76–100

Block 3 connects the call to the subscriber.

Recording ends when the call leaves NoMoreScamCalls control.

### Final Standing 0–75

Block 3 maintains control of the call while recording continues.

The preferred unavailable-message start target is approximately 48 seconds from call start.

When failed disposition is available before that target, Block 3 holds the call until the target and then begins playing:

> "We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later. Goodbye."

When failed disposition becomes available at or after the target, Block 3 begins the same playback immediately. This includes disposition reached after second 59.

Block 3 correlates that specific playback using Telnyx `client_state`.

Successful acceptance of the Telnyx speak command does not complete the call. Block 3 allows the complete unavailable message to play and waits for the correlated unavailable-message `call.speak.ended` event, then finalizes and disconnects the call immediately.

Second 59 is not a hard playback cutoff. Complete unavailable-message playback takes precedence over avoiding another billed minute.

After Telnyx successfully accepts the unavailable-message speak request, Block 3 starts one 20-second playback-completion safety timer. If the valid correlated completion has not arrived when that timer expires, Block 3 finalizes and disconnects the failed call through the same one-shot path. A normal, duplicate, or late completion cannot cause duplicate finalization.

Recording ends after the call is disconnected.

---

## Evidence

Block 3 keeps the original source names.

### Telnyx

- call identifiers
- calling number
- called number
- STIR/SHAKEN results received from Block 2
- CNAM received from Block 2
- carrier and line information received from Block 2
- request timing
- caller-speech timing
- recording reference
- call timing
- Telnyx deductions received from Block 2

### OpenAI

- first response transcript
- first response name result
- first response reason result
- extracted first response information
- second response transcript when used
- second response name result when used
- second response reason result when used
- extracted second response information when used
- caller-response deductions
- recovered caller-response deductions

### IPQS

- complete returned response
- `valid`
- `active`
- `recent_abuse`
- `spammer`
- individual IPQS deductions

### Standing

- starting standing
- Block 2 deductions
- caller-response deductions
- recovered deductions
- IPQS deductions
- final standing

### Call Result

- connected or diverted
- connection or disconnection timestamp
- recording reference
- recording completion

---

## Output

Block 3 passes the completed evidence to Block 4 only after:

- the call has been connected or diverted
- the recording has ended
- the final standing has been recorded
- the evidence has been labeled by its original source

---

## Error Handling

When an implementation error prevents Block 3 from completing the call, Telnyx plays:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

The call is then disconnected.

Implementation errors do not create caller deductions.

---

## Change Control

If implementation and this SOP differ, this SOP is authoritative.

Changes to this flow require approval before code is changed.
