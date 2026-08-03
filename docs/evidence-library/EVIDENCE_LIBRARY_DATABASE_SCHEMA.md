# Evidence Library Database Schema

## Evidence Library Calls

Every inbound call produces one permanent chronological Call Record.

The complete Evidence Box remains stored intact.

Caller and Subscriber information remain separate within the same Call Record.

Every individual column may be searched alone or combined with any other column.

Later Telnyx information is added to the existing record using the Telnyx Call Session ID.

### Call Identity

- Telnyx Call Session ID
- Telnyx Call Control ID
- Call Record Created At
- Call Start
- Call Completion
- Final Standing
- Final Disposition
- Complete Evidence Box

### Caller — Who

- Calling Number
- CNAM
- Carrier
- Line Type
- STIR/SHAKEN
- IPQS
- Caller Name
- Caller Name Accepted

### Caller — What

- Block 2 Findings
- Block 2 Deductions
- Prompt 1 Recording
- Prompt 1 Transcript
- Prompt 1 Evaluation
- Prompt 2 Recording
- Prompt 2 Transcript
- Prompt 2 Evaluation
- Reason For Calling
- Reason Accepted
- Caller Response Deductions
- Recovered Deductions
- IPQS Deductions
- Complete Call Recording
- Call Duration
- Billable Minutes
- Call Cost

### Caller — Where

- Country
- State
- County
- City
- ZIP Code
- Area Code
- Geographic Information

### Caller — When

- Call Date
- Call Start Time
- Day Of Week
- Week Of Month
- Month
- Year
- Prompt 1 Time
- Prompt 2 Time
- Connection Time
- Diversion Time
- Recording Available Time

### Caller — Why

- Stated Reason
- Accepted Reason
- Unaccepted Reason
- Supporting Evidence
- Deductions
- Final Standing
- Final Disposition

### Subscriber — Who

- Subscriber ID
- Subscriber Name
- Subscriber Telephone Number
- Screening Number
- SIP Username
- Carrier
- Account Status
- Coverage Status

### Subscriber — What

- Connected
- Diverted
- Final Standing
- Final Disposition
- Call Duration
- Billable Minutes
- Call Cost

### Subscriber — Where

- Country
- State
- County
- City
- ZIP Code
- Community

### Subscriber — When

- Call Date
- Call Start Time
- Day Of Week
- Week Of Month
- Month
- Year
- Connection Time
- Call Completion Time

### Subscriber — Why

- Final Standing
- Final Disposition
- Supporting Evidence

## Chronology

Call Records are ordered by Call Start.

The Telnyx Call Session ID uniquely identifies the Call Record.

The Telnyx Call Control ID remains attached as the operational call reference.

## Search

Every column is searchable.

Searches may use Caller fields, Subscriber fields, one of the Five W's, multiple Five W's, or any combination of individual fields.

