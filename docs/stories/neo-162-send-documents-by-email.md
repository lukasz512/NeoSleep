# NEO-162: send documents to the patient by email

Status: stage 0 (NEO-190) built; stages 1–3 planned.
Decisions: Łukasz, 2026-09-28/29, in decision forms
[round 1](https://claude.ai/artifact/VKjFsvaTR8jYPyaVhUj6Hj) and
[round 2](https://claude.ai/artifact/2YYKrKqze3j3RTY2jxejUV).

## Why

The "Send by email" button on the patient said "sent" as soon as Resend
accepted the email. On 2026-09-28 a test email reached the home.pl mailbox,
but Outlook only showed it much later. Nobody could tell whether the patient
had actually received it. The doctor also needs to choose what goes out and
in what form. Today one fixed link covers every open questionnaire.

## As a doctor I want to…

- choose which documents go to the patient, and for each one whether it goes
  as an online link (for filling in or signing) or as a PDF;
- see whether each email reached the patient: delivered, bounced, or marked
  as spam;
- get a confirmation of what was sent. It has no active links: to whom, what,
  and when.

## Decided

| # | Decision |
|---|---|
| Recipient | Only the patient's email from the record. |
| Default selection | Documents the patient hasn't filled or signed yet. |
| Form | Chosen per document. Anything to fill in goes as an online link; completed or signed copies go as PDF. |
| Doctor's documents | Oral exam and Historia Clínica can be sent only after they are completed, and only as a copy. |
| Attachments | Only fully blank templates: clinic header and empty lines for the patient to fill in by hand. Any PDF with patient data goes only via a tokenized link. |
| Link validity | 7 days. After that, the doctor sends a new link with one click. |
| Signed paper | Comes back at the visit, and staff scan it into the record. |
| Copy for the doctor | Optional. A confirmation without active links. |
| History | Per patient, with the delivery status reported by the Resend webhook. |
| Dialog hints | A "check your SPAM folder" hint and a "copy link" button. |
| Channel | Email only. SMS and WhatsApp come with the notifications epic. |
| Sender | "&lt;clinic&gt; \| NeoSleep" &lt;notifications@mail.neosleepcare.com&gt; (NEO-178). |
| Tracking | No open or click tracking in patient emails. |
| Materials | Taken from the OrthoApnea library. The file is fetched when the email is sent, and a copy or hash is kept. Open question: does the partner agreement allow sending these files to patients? |

## Stages

0. **NEO-190** — Resend webhook, `patient_email_send` log, `GET /patient/:id/email-sends`.
1. Send dialog: document list with a form per item, email preview, history in the patient record.
2. PDFs: blank-template renderer as an attachment, and patient PDFs via a link.
3. Information materials. Blocked until the OrthoApnea licence answer.

Deliverability testing (Outlook, Gmail, home.pl, Onet, WP) is **NEO-177**.
