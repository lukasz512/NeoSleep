# NEO-265: ship the device to the clinic or to another address

**As** a doctor (or the admin ordering for one), **I want** to choose where the device is delivered, **so that** it reaches me when I am not at the clinic.

## Five angles
- User: clinic stays the default; "Another address" is a conscious choice.
- Tenant: same rules as OrthoApnea's order form (name up to 40 characters, province only for CA/ES/DE/US).
- Patient: the device arrives where someone can receive it.
- Platform: one shared validator in `packages/device-order`, used by API and PWA.
- Compliance: a typed address is not stored in the profile. The "Remember" checkbox needs a migration and Legal wording, so it is a follow-up.

## Acceptance criteria
1. The wizard offers Clinic / Another address; Clinic is preselected.
2. Another address requires name, address, city, postal code, country, phone and email.
3. A name over 40 characters is rejected; province is required only for CA/ES/DE/US.
4. The API accepts `custom_delivery` or `delivery_organization_id`, never both.
5. The OA payload carries the typed address and province.
