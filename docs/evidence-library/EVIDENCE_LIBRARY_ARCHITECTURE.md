# NoMoreScamCalls Evidence Library Architecture

## Purpose

The Evidence Library is the permanent repository for every completed call processed by NoMoreScamCalls.

Its purpose is to preserve every completed call exactly as it occurred while making every individual piece of evidence independently searchable for future research, trending, reporting, and investigation.

The Evidence Library stores evidence.

It does not investigate evidence.

It does not score evidence.

It does not modify evidence.

It preserves evidence.

---

## Organization

The Evidence Library stores every completed call in chronological order.

Every completed call receives one permanent Call Record.

The Telnyx Call Session ID serves as the permanent identifier for the Call Record.

The Telnyx Call Control ID remains associated with that same record.

If additional information becomes available after the call has ended, including recordings, recording duration, billable minutes, total call duration, or Telnyx cost information, that information is appended to the existing Call Record.

The original evidence is never rewritten.

---

## Call Record

Each completed call contains one complete Call Record.

The Call Record contains the complete Evidence Boxes produced during processing together with all later information associated with that call.

The complete Call Record remains intact while every individual evidence element is independently searchable.

---

## Participants

Every Call Record contains two participants.

### Caller

The individual or organization placing the call.

### Subscriber

The protected NoMoreScamCalls subscriber receiving the call.

Caller information and Subscriber information remain completely separate while belonging to the same Call Record.

---

# Caller

## Who

- Calling Number
- Caller Name (CNAM)
- Carrier
- Line Type
- STIR/SHAKEN
- IPQS Results
- Name Provided
- Name Acceptance

## What

- Block 2 Findings
- Block 2 Deductions
- Prompt 1 Response
- Prompt 1 Transcript
- Prompt 1 Evaluation
- Prompt 2 Response
- Prompt 2 Transcript
- Prompt 2 Evaluation
- Reason for Calling
- Caller Response Deductions
- IPQS Deductions
- Final Standing
- Final Disposition
- Recording
- Call Duration
- Billable Minutes
- Cost

## Where

- Country
- State
- County
- City
- ZIP Code
- Area Code
- Geographic Information

## When

- Call Start
- Prompt 1
- Prompt 2
- Connection Time
- Diversion Time
- Call Completion
- Recording Available
- Total Call Duration
- Billable Minutes

## Why

- Stated Reason
- Accepted Reason
- Unaccepted Reason
- Evidence Generated
- Deductions Applied
- Final Standing
- Final Disposition

---

# Subscriber

## Who

- Subscriber ID
- Subscriber Name
- Subscriber Telephone Number
- Screening Number
- SIP Username
- Carrier
- Account Status
- Coverage Status

## What

- Connected
- Diverted
- Final Standing
- Final Disposition
- Call Duration
- Billable Minutes
- Cost

## Where

- Country
- State
- County
- City
- ZIP Code
- Community

## When

- Call Start
- Connection Time
- Call Completion
- Total Call Duration
- Billable Minutes

## Why

- Final Standing
- Final Disposition
- Supporting Evidence

---

## Search

Every individual evidence element contained within the Evidence Library is searchable.

Searches may be performed against:

- Caller
- Subscriber
- Who
- What
- Where
- When
- Why
- Any combination of the above

The original Call Record is never modified by searching.

---

## Research

Research operates against information stored within the Evidence Library.

Research may identify:

- Scam trends
- Geographic trends
- Time trends
- Subscriber characteristics
- Caller characteristics
- Scam characteristics
- Cost trends
- Call duration trends
- Relationships between evidence
- Additional investigative patterns

Research never alters the stored evidence.

---

## Knowledge Engine

The Knowledge Engine performs research using the Evidence Library.

It discovers relationships.

It identifies trends.

It supports investigation.

It never modifies the archived Call Record.
