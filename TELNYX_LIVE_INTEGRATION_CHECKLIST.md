# Telnyx Live Integration Checklist

## Current backend status

- Telnyx webhook handling exists.
- Caller screening exists.
- Challenge flow exists.
- User routing exists.
- Approved calls resolve to user.app_identity.
- Passed challenges route back to the protected user's app identity.
- Telnyx request building is simulated.
- Live Telnyx execution is disabled by default.
- TELNYX_LIVE_EXECUTION defaults to false.

## Unknowns that must be confirmed before live execution

### 1. Approved call delivery command

Confirm the exact Telnyx Call Control command required to deliver an approved call to a WebRTC/app user.

Questions:

- Is the correct command bridge, transfer, dial, connect, or another Call Control action?
- Does the command use the existing call_control_id?
- Does it create a second leg?
- What webhook events should we expect after issuing the command?

### 2. App/WebRTC destination format

Confirm the exact destination format Telnyx expects for app delivery.

Questions:

- Is the destination a SIP URI?
- Is it a credential connection username?
- Is it a client/app identity?
- Is it formatted like sip:user@connection, client:user, or something else?
- Does the backend need a connection ID or application ID?

### 3. Authentication

Confirm what the backend needs for live Telnyx API calls.

Questions:

- API key secret name?
- Base URL?
- Required headers?
- Any idempotency header needed?
- Retry behavior?

### 4. WebRTC app setup

Confirm the pieces needed outside the backend.

Questions:

- Credential Connection required?
- iOS/Android/JS SDK identity format?
- Push credentials required before background ringing?
- Can foreground WebRTC receive calls without push during early testing?

### 5. Safe first live test

Minimum live test should verify:

- Incoming call reaches Telnyx DID.
- Backend receives call.initiated.
- Backend identifies protected user by screening_number.
- Known allowed caller produces allow/bridge path.
- Execution policy blocks live calls unless explicitly enabled.
- When enabled, exactly one live Telnyx action is sent.
- No PSTN dial-back loop occurs.
