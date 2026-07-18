# BLOCK 4 – ROUTING SOP

## Purpose

Block 4 is the Routing Block of the Evidence Engine.

Its sole responsibility is to route the call according to the final standing received from Block 3.

Block 4 performs no analysis.

Block 4 gathers no evidence.

Block 4 makes no decisions.

Block 4 does not calculate or modify standing.

Block 4 simply routes the call according to this SOP.

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

The Evidence Box represents the completed screening results for the current call.

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

Match the final standing to the routing rules defined by this SOP.

### Step 4

Execute the required routing action.

### Step 5

Record the routing action performed.

---

# Routing Rules

## Standing 86–100

Trigger the approved Telnyx call-control action to connect the caller to the subscriber.

Observation Mode continues until control of the call is transferred.

---

## Standing 76–85

Block 3 has already completed IPQS processing when required.

Trigger the approved Telnyx call-control action to connect the caller to the subscriber.

Observation Mode continues until control of the call is transferred.

---

## Standing 0–75

Maintain control of the call until approximately the fifty-five second mark.

Continue Observation Mode throughout this period.

At approximately the fifty-five second mark, play the following message:

> "We're sorry, but the party you are trying to reach is unavailable at this time. Please try your call again later."

Terminate the call before the beginning of the second billing minute.

---

# Output

Block 4 produces a Routing Record containing:

* Final standing
* Routing action executed
* Routing timestamp
* Routing completion status

The Routing Record becomes the output of Block 4.

---

# Boundaries

Block 4 knows only:

* the completed Block 3 Evidence Box
* the final standing
* the routing rules defined by this SOP

Block 4 does not know:

* how evidence was collected
* how deductions were assigned
* how the standing was calculated
* why a particular standing was produced
* how future blocks operate

Block 4 receives a completed Evidence Box.

Block 4 reads the final standing.

Block 4 performs the routing required by this SOP.

Block 4 produces a Routing Record.

Block 4 performs no other function.

---

# Error Handling

If Block 4 encounters an implementation error that prevents completion of its routing responsibility, the caller shall be played the standard system error message:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Immediately following the message, the call shall be disconnected.

Implementation errors are operational events only.

They are never considered caller evidence and shall not alter the caller's standing, recorded evidence, or any other information contained within the Evidence Box.

---

# Change Control

Changes to routing thresholds, routing actions, or Block 4 responsibilities require an approved revision to the Evidence Engine architecture.

If implementation and this SOP differ, this SOP is the authoritative source.
