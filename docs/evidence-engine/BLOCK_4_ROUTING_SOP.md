# BLOCK 4 – ROUTING SOP

## Purpose

Block 4 is the Routing Block of the Evidence Engine.

Its sole responsibility is to route both:

- the live call
- the completed Evidence Box

according to the completed Block 3 Evidence Box.

Block 4 performs no analysis.

Block 4 gathers no evidence.

Block 4 makes no decisions.

Block 4 does not calculate or modify standing.

Block 4 simply routes the call and the completed Evidence Box according to this SOP.

---

# Operating Principle

Every inbound call enters Observation Mode immediately upon entering the Evidence Engine.

Observation Mode begins with the first interaction between the system and the caller and continues until the call leaves the control of the Evidence Engine.

During Observation Mode, the caller's side of the call is continuously recorded. This includes spoken responses, silence, background conversations, background noises, and any other available audio.

This recording is performed for every call regardless of the caller's standing or eventual routing outcome.

Observation Mode exists to maximize evidence collection while the call remains under the control of the Evidence Engine.

Observation Mode is established before Block 4 begins execution.

Block 4 neither starts nor stops Observation Mode.

---

# Trigger

Block 4 begins execution immediately upon receiving the completed Block 3 Evidence Box.

---

# Input

Block 4 receives the completed Block 3 Evidence Box.

The final standing contained within the Evidence Box is accepted as fact.

Block 4 never recalculates, questions, modifies, or interprets the standing it receives.

---

# Standard Operating Procedure

### Step 1

Receive the completed Block 3 Evidence Box.

### Step 2

Read the final standing.

### Step 3

Execute the required call routing.

### Step 4

Route the completed Evidence Box to the Evidence Library.

### Step 5

Record completion of both routing operations.

---

# Routing Rules

## Standing 86–100

Transfer the caller to the protected subscriber.

Route the completed Evidence Box to the Evidence Library.

---

## Standing 76–85

IPQS processing has already been completed by Block 3.

Transfer the caller to the protected subscriber.

Route the completed Evidence Box to the Evidence Library.

---

## Standing 0–75

Maintain control of the call until approximately the fifty-fifth second.

Continue Observation Mode throughout this period.

Play:

> "We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later."

Disconnect before the second billing minute begins.

Route the completed Evidence Box to the Evidence Library.

---

# Output

Block 4 produces:

- Completed call routing
- Completed Evidence Box delivery to the Evidence Library
- Routing timestamp
- Routing completion status

The archived Evidence Box may later have the Telnyx recording associated with it after the recording becomes available.

---

# Boundaries

Block 4 knows only:

- the completed Block 3 Evidence Box
- the final standing
- the routing rules defined by this SOP

Block 4 does not know:

- how evidence was collected
- how deductions originated
- how standing was calculated
- why the standing exists
- how future processing operates

Block 4 performs routing only.

---

# Error Handling

If Block 4 cannot complete its routing responsibility, play:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Disconnect the call.

Implementation failures never alter the Evidence Box.

---

# Change Control

Changes to Block 4 responsibilities require an approved revision to the Evidence Engine architecture.

If implementation and this SOP differ, this SOP is authoritative.
