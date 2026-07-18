# BLOCK 1 – CALL INTAKE SOP

## Purpose

Block 1 receives a new inbound call from Telnyx.

Its sole responsibility is to receive the call information created by Telnyx, place that information into the Block 1 Evidence Box, and pass the completed Evidence Box to Block 2.

Block 1 performs no other function.

---

## Trigger

Block 1 begins when Telnyx notifies the Evidence Engine of a new inbound call.

---

## Standard Operating Procedure

1. Receive the inbound call information from Telnyx.
2. Receive the Telnyx call record created for the call.
3. Receive the billing timer information established by Telnyx.
4. Place the received information into the Block 1 Evidence Box.
5. Pass the completed Block 1 Evidence Box to Block 2.

---

## Output

The completed Block 1 Evidence Box contains the information received from Telnyx for the current call.

Block 1 does not modify, evaluate, or supplement this information.

---

## Boundaries

Block 1 does not:

- perform screening
- collect evidence
- assign deductions
- calculate standing
- perform lookups
- make routing decisions
- communicate with later blocks

Block 1 knows only the information it receives from Telnyx for the current call.

---

## Error Handling

If Block 1 encounters an implementation error that prevents completion of its responsibility, the caller shall be played the standard system error message:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Immediately following the message, the call shall be disconnected.

Implementation errors are operational events only.

They are never considered caller evidence and shall not alter any information contained within the Block 1 Evidence Box.

---

## Change Control

Changes to the responsibilities of Block 1 require an approved revision to this SOP before implementation is changed.

If implementation and this SOP differ, this SOP is the authoritative source.
