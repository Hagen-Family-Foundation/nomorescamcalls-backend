# BLOCK 2 – TELNYX SCREENING SOP

## Purpose

Block 2 establishes the caller’s starting standing and receives the screening information produced by Telnyx.

Every call begins Block 2 with a standing of 100.

Block 2 places the Telnyx screening information into the Block 2 Evidence Box and passes the completed Evidence Box to Block 3.

Block 2 performs no other function.

---

## Trigger

Block 2 begins when it receives the completed Block 1 Evidence Box.

---

## Standard Operating Procedure

1. Receive the completed Block 1 Evidence Box.
2. Establish the caller’s starting standing at 100.
3. Receive the calling-number information produced by Telnyx.
4. Receive the STIR/SHAKEN information produced by Telnyx.
5. Receive the CNAM information produced by Telnyx.
6. Receive the carrier and line-lookup information produced by Telnyx.
7. Place the received screening information and starting standing into the Block 2 Evidence Box.
8. Pass the completed Block 2 Evidence Box to Block 3.

---

## Output

The completed Block 2 Evidence Box contains:

- the completed Block 1 Evidence Box
- starting standing of 100
- calling-number information
- STIR/SHAKEN information
- CNAM information
- carrier and line-lookup information

Block 2 does not interpret, modify, or supplement the screening information received from Telnyx.

---

## Boundaries

Block 2 does not:

- gather caller-response evidence
- play prompts
- record or transcribe caller responses
- assign deductions
- modify standing
- perform IPQS
- make routing decisions
- determine final disposition

Block 2 knows only the completed Block 1 Evidence Box, the starting standing, and the Telnyx screening information within its responsibility.

---

## Error Handling

If Block 2 encounters an implementation error that prevents completion of its responsibility, the caller shall be played the standard system error message:

> "We are sorry, but we are having technical difficulties at this time and cannot complete your call. Please try your call again later. Goodbye."

Immediately following the message, the call shall be disconnected.

Implementation errors are operational events only.

They are never considered caller evidence and shall not alter the caller’s standing or any information contained within the Evidence Box.

---

## Change Control

Changes to the responsibilities of Block 2 require an approved revision to this SOP before implementation is changed.

If implementation and this SOP differ, this SOP is the authoritative source.
