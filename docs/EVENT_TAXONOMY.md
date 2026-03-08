# Event taxonomy (v1)

## Naming
- `snake_case`
- Include module prefix when useful: `rep_meeting_started`

## Core events
### Meetings
- `rep_meeting_started` { meetingId, leadId?, hcpId?, hcoId?, ts }
- `rep_meeting_stopped` { meetingId, durationSec, ts }

### PCF
- `rep_pcf_opened` { meetingId, ts }
- `rep_pcf_submitted` { meetingId, submissionId, ts }
- `rep_pcf_queued_offline` { meetingId, queueId, ts }
- `rep_pcf_synced` { queueId, ts }

### Content / slides
- `rep_presentation_opened` { presentationId, meetingId?, ts }
- `rep_slide_viewed` { presentationId, page, viewMs, meetingId?, ts }
- `rep_slide_engagement` { presentationId, page, score, meetingId?, ts }

### AI
- `rep_ai_question` { feature: "copilot", locale, ts }
- `rep_ai_pcf_draft` { feature: "pcf_draft", locale, ts }

## Redaction rules
Never include:
- patient identifiers
- free-text transcripts in event logs
Instead include:
- hashed IDs
- metadata and timings
