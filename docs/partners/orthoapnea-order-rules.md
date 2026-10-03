# OrthoApnea order rules — source of truth (NEO-210)

Every validation rule of the device-order form comes from OrthoApnea (Łukasz, 2026-10-03). This file records what OA's own portal does, so that CORE-95 (`@neo/device-order`, zod 4) can copy it rule by rule and cite the source.

Sources:
- **Static harvest (2026-10-03).** OA's public Angular bundle `main.afc4578288f05cdf.js` (9 441 842 bytes) plus `/assets/i18n/es.json` and `en.json`. Every item cites the minified name and the byte offset. No `/api` endpoint was called for this.
- **Read-only catalog (2026-10-03).** `pnpm --filter @neo/api oa:test-order -- --catalog`. See "Live read results" below.
- **Live test orders 1–4.** Appended under "Live order results" after each approved send.

When OA ships a new bundle, re-run the harvest and diff it against this file. A changed validator means a changed rule on our side.

Minified helper names used below:

| Name | Meaning |
|---|---|
| `Te` | Angular `Validators` |
| `an` | product-code enum |
| `Oi` | product category |
| `Er` | product typeId |
| `we` | treatment status |
| `Fn` | notification/history action |
| `og` | 1000 |

## Live read results (2026-10-03, read-only)

- **Error format.** OA answers with Spring Boot's default error body `{timestamp, status, error, message, path}`. The `message` is human-readable, e.g. `Required Integer parameter 'productId' is not present`. The `path` carries the server prefix `/apneadock/api/...`.
- **Minimum desired date.** `GET /api/products/manufacturingDate?productId=<id>` requires `productId`. For NOA (`manufacturingDays: 10`) it returned `"2026-10-19T00:00:00"`. Our wizard's fixed +15 days is wrong; we must use this endpoint.
- **Countries.** 88 countries; Mexico has id 29.
- **Shared account.**
  - `ROLE_DOCTOR` with `fsDoctorId` 46355.
  - One invoice customer: MX, `paymentOption` 6, `socialSecuriryPatient` false.
  - One clinic: 34352, in CDMX.
  - Every product-disable flag is false.
  - No traditional-printing pickup address.

---

## 1. Form controls and validators

### 1.0 Wizard shell — `rnt`, the `app-treatment-form-general` component (class @1307575, selector @1319667)

- Routes (@6696432):
  - `create-treatment/:patientId`, guarded by `L9`, `fq`, `N0`, `W7`.
  - `edit-treatment/:patientId/:treatmentId`, guarded by `L9`, `N0`, `nct`, `W7`.
- Guards:
  - `L9` (@4149321): the doctor must own at least one clinic with name, address, postalCode, city and country, plus province when the country is ES (`validClinic` @1042911). Otherwise the guard redirects to /profile.
  - `fq` (@4150316): the user must have at least one customer with `validated === true` (`validCustomers` @4150959). Otherwise it redirects to create-customer.
  - `W7` (@561115): blocks ROLE_DIAGNOSIS_DOCTOR.
  - `nct` (@4152182): editing is allowed only while `statusId === MORE_INFORMATION_PENDING (3)`. Otherwise it redirects to the recap page.
- Forms built in `initForms()`:
  - `deliveryForm = $N(fb)`
  - `deviceForm = XN(fb)`
  - `imagesAndFilesForm = KN(fb)`
  - `modelsOptionForm = QN(fb)`
  - `fsEntriesForm = JJ(fb)`, which is billing lines and not used by doctors.
- Tabs: `["delivery","constructionData","impressionAndModels"]`, labelled Envío/Shipping, Datos de construcción/Manufacturing information, and Registro dental/Dental register.
- **Navigation gating** (`isPosibleGoToTab` @1311565, `isPosibleLeaveTab`):
  - Leaving `delivery` requires `deliveryForm.valid`. Otherwise `validateDeliveryForm` becomes true and the errors show.
  - Going to `impressionAndModels` requires `deliveryForm.valid`, the imagesAndFiles form, and **no** `deviceForm.errors.invalidPersonalizedSequence`.
  - If the product category is REPAIR_READJUSTMENT, `ignoreInvalidAdvancedOrInvalidStartingPoint` is set, and the step needs delivery and images valid.
  - **`deviceForm.valid` is NOT checked** on the route to save. `invalidAdvanced`, `invalidAdvancedLess5`, `invalidStartPoint`, the min/max violations and a missing product do not block the doctor.
  - The "leave construction data with invalid advance" modal (`testLeaveConstructionDataWithInvalidAdvanceOrInvalidStartingPoint`) is never called, so it is dead code.
  - `validatorConstructionDataForm()` is never called either. So `validateConstructionDataForm` stays false, and every construction-data message gated on `validateForm` is never shown (details in §2).
- The Save/Next button on the last tab appears only when `modelsOptionForm.valid` (`showSaveButton`). It then goes to `app-treatment-confirmation` and on to `sendTreatment()` (@1316044).
- `updateCurrentTreatment()` (@1314025) runs just before the payload is built:
  - If the product code is not CLASSIC, NOA or NOA_TMJ, it sets `morningAligner = false`.
  - If the product code is not NOA, it sets `camType = false`.
  - It sets `customerId` and `customerName` from `deliveryForm.invoiceCustomer`, then calls `ntt(...)`.
  - It sets `user` and `creator` to `{id: <jwt user id>}` and `responsible` to `{id:null}`.
  - Insurance number: if the invoice customer is in FR or ES and has `socialSecuriryPatient` set (that is the actual spelling), the treatment's `insuranceNumber` is replaced by `patient.insuranceNumber`.

### 1.1 Patient form — `app-create-patient` (class @4497077, selector @4506762)

| control | default | validators | notes |
|---|---|---|---|
| name | "" | required | Patient "identifier". Typeahead. On change `validatorPatient()` (@4505497) trims it, collapses whitespace, and sets `existingNameError` if another patient of this doctor has the same name (case-insensitive). Submit is blocked while `existingNameError`. |
| email | "" | email | |
| male | "" | — | Radio with toggle semantics: `setMan` gives true or null, `setWoman` gives false or null. |
| identityNumber | "" | — | Label "DNI" |
| insuranceNumber | "" | — | Label "Nº seguridad social" |
| birthDate | "" | required | ngb datepicker. Create default `{year:2000,month:1,day:1}`. Range from today−110 years to today, opening at today−40 years. Sent as `hr()`, i.e. `"YYYY-MM-DDT00:00:00"`. |
| phone | "" | — | |
| province | "" | — | Shown only when `ia(country).show` (§7) |
| city | "" | — | |
| address | "" | — | |
| postalCode | "" | — | |
| country | "" | required | Country object. Defaults to the doctor's own country. |
| profession | "" | — | |
| observerEmail | "" | — | Resolved through `GET /api/user/findByEmail/{email}`. Becomes observerId, or userDiagnosisId when that user is ROLE_DIAGNOSIS_DOCTOR. Rejected if locked, observerDisabled, or the doctor's own email. |
| userDiagnosisEmail | "" | — | Same lookup |

- Group validator `validateFrenchInsurance` (@4498340):
  ```
  if country.code == "FR" && insuranceNumber:
      errors = {address?:true, postalCode?:true, city?:true}  // one entry per missing field
      return errors or null
  ```
- **Alternative patient form** (`setAlternativeForm` @4504477) applies when the user has `userDataApneadockDTO.alternativePatientForm`. It also makes male, phone, province, city, address and postalCode required.
- Submit (`submit`): `submitClick = true`, then it requires `form.valid && !existingNameError`. `fieldIsValid` shows errors only after the first submit.

### 1.2 Treatment delivery form — `$N` (@509835), rendered by `app-treatment-form-delivery` (class @1053547, selector @1057793)

| control | default | validators | UI / notes |
|---|---|---|---|
| clinic | "" | required | ClinicDTO object. Auto-selected when the doctor has exactly one clinic, or the patient's clinicId matches one. |
| addressSend | false | — | Radio: false = "Clínica", true = "Dirección alternativa" |
| country | "" | — (KJ) | Defaults to the patient's country (`setDefaultCountry` @1057314) |
| province | "" | — (KJ) | Free text. Shown only when `ia(country).show` |
| city | "" | — (KJ) | |
| phone | "" | — (KJ) | |
| name | "" | — (KJ) + **maxlength 40** | The `maxlength="40"` attribute also registers Angular's MaxLengthValidator |
| address | "" | — (KJ) | |
| postalCode | "" | — (KJ) | No format check |
| email | "" | email (+KJ) | |
| invoiceCustomer | "" | (customerNotValid) | Select from the validated customers of `GET /api/user/{id}`. Auto-set when there is exactly one. |
| fsDoctor | null | — | Set to `{id:user.fsDoctorId, name, dock:3, …}` |
| patient | "" | required (+patientNotValid) | Patient object |
| date | "" | — | Desired date. Set by `app-desire-date-input` (selector @1109905), never typed directly. |
| invoiceCustomerSearchBy* | "" | — | Unused |
| parentTreatmentId | "" | — | |
| normal / archived / archivedCompensated / estimate | true / false / false / false | — | Technician flags |
| workSheets | [] | — | FormArray |
| materialBatch / productBatch / supplierDeliveryNote / sendNumber / samePatientTreatments | "" | — | Technician fields |
| distributorSendAddressActive | "" | — | Set from `user.userDataApneadockDTO.distributorSendAddressActive` |
| insuranceNumber | "" | (insuranceNumberNotValid) | Shown only when `isSocialSecuriryPatient() && isGermany()`, i.e. the invoice customer is in DE |
| noContactDoctorForRedesign | "" | — | Toggled on the confirmation screen |

Group validators `[KJ, a, s, d, f]`:

- **KJ** (@509514):
  ```
  if !addressSend: null
  else if country && (province || !ia(country.id).required) && city && postalCode
          && address && email && phone && name: null
  else {fieldIsEmpty:true}
  ```
  All alternative-address fields are required, phone included. Province is required only for CA, ES, DE and US.
- **a**: `invoiceCustomer?.id` must be truthy, otherwise `{customerNotValid:true}`.
- **s**: `clinic.fsClinicId || clinic.id` must be truthy, otherwise `{clinicNotValid:true}`.
- **d**: `patient?.id` must be truthy, otherwise `{patientNotValid:true}`.
- **f**:
  ```
  if invoiceCustomer.id && invoiceCustomer.country.id == 15 (DE)
     && invoiceCustomer.socialSecuriryPatient
     && (!insuranceNumber || insuranceNumber.length < 3):
      {insuranceNumberNotValid:true}
  ```

Desired date (`app-desire-date-input`, class @1107845):

- `min = GET /api/products/manufacturingDate?productId=<id>&fsDoctorId=<id>` (@457003).
- When the product changes, or the chosen date is earlier than the minimum, the date is reset to that minimum.
- Traditional printing adds 1 working day through `GET /api/products/addWorkingDays`.
- There is no validator. `deliveryDaterequiredValueMsg` is bound to a local form with no validators, so it is effectively never shown.

### 1.3 Treatment configuration form — `XN` (@511172), rendered by `app-treatment-form-construction-data` (class @1174481, selector @1190405)

| control | default | validators | notes |
|---|---|---|---|
| product | null | **required** | The full product object from `GET /api/products?page=0&size=1000`, chosen in the product-selector modal |
| promotionCode | null | — | PromotionCode object, not a string (§3) |
| productDiscount | 0 | — | |
| camType | true | — | Forced to false: `showCamTypeInput()` sets it false on every render (@1189877) and `updateCurrentTreatment` sets it false for anything that is not NOA. Label mapping: true = "thin", false = "standard". |
| verticalDimension | 1000 (`og`) | — | 1000 = "Registro", 2000 = "Mínima", otherwise mm. The free input is rounded to 1 decimal and clamped to 0..20 (@910034). |
| retrusionMax (MR) | null | min(-20), max(20) | UI `controlMaxLimit` clamps to ±20 and rounds to 0.1 |
| protrusionMax (MP) | null | min(-20), max(20) | Same as MR |
| startingPoint (SP, mm) | null | — (YAt) | Clamped to −20..20. It and the % field are computed from each other and mutually disabled. |
| startingPointPorcentage | null | — | 0..100. **Not sent**: `calculateSPmm = MR + %·(MP−MR)/100` |
| theramonNeeded | false | — | Not in the UI |
| maxOpening | 0 | min(0), max(80) | Not in the UI |
| sequenceTypeStandard | true | — | Click handler: standard true / personalized false, `sequenceUnitInMM = true`, seq1..6 reset |
| sequenceTypePersonalized | false | — | |
| sequenceUnitInMM | true | — | Radio mm(true) or %(false). Personalized only. |
| sequenceTypeP_1 … _10 | null | — (KAt) | P1–P3 = main splints, P4–P6 = additional splints, P7–P10 unused by the doctor UI |
| facialBiotype | "1" | — | "1" MESO, "2" DOLICHO, "3" BRACHY. Shown only if the invoice customer is in DE (`LC`) |
| deviationRight / deviationLeft | 0 / 0 | — | Mutually exclusive: setting one zeroes the other. Rounded to 0.1. |
| deviationAdvanceRight / deviationAdvanceLeft | 0 / 0 | — | Mutually exclusive |
| observations | "" | — | Textarea |
| teethStatus | "" | — | `app-teeth-status` returns a JSON string (§3) |
| laterality | null | min(0), max(5) | UI clamp 0..5. Confirmation shows 3 when null. |
| limitOpening | null | min(0) | UI clamp 0..12. Confirmation shows 7 when null. |
| anteriorFrontalOpening | false | — | |
| mixedSplintDesign | **true** | — | Finish 1. Exclusive with scalloped. |
| scallopedSplintDesign | false | — | Finish 2 |
| slotsForElasticBands | false | — | "Ganchos para gomillas" |
| upperBandSplintDesign / lowerBandSplintDesign | 0 / 0 | — | Values 1..6. Clicking the same value again resets to 0. 0 is sent as 3. |
| techObservations | "" | — | |
| morningAligner | false | — | Checkbox, shown when `showMorningAlignerInput()` (§2) |
| michiganTypeOfGuide | 0 | — | Orthobrux: 0 canine+incisal, 2 canine, 3 incisal, 1 flat |
| michiganLingualPalatineFinish | 0 | — | 0 straight, 1 scalloped |
| michiganMaterial | 1 (`_v.NYLON`) | — | `_v`: 0 RESIN, 1 NYLON, 2 ACRiLIC. The UI offers nylon and resin. |
| upperLowerSplint | false | — | false = upper, true = lower. Becomes `upperSplint = !v`, `lowerSplint = v`. |
| accessoriesQuantity | 0 | — | Fork (code 1003) select: 5, 10 or 25 |
| attachmentsUpper / attachmentsLower | false | — | Attachments-template repair only |

Group validators `[$At, XAt, jAt, YAt, KAt]`:

- **$At** (@512629) — **ineffective**:
  ```
  if product.value !== an.NOA ("002") return null
  if limitOpening !== null && maxOpening !== null && limitOpening <= maxOpening return null
  return {invalidLimitOpening}
  ```
  `product.value` is a product **object**, so `!== "002"` is always true and it always returns null. If it were fixed, it would compare limitOpening against maxOpening, and maxOpening stays 0 in the doctor UI. Any limitOpening > 0 would then fail.
- **XAt** (@512832) — applies to **every product**:
  ```
  mr = +retrusionMax; mp = +protrusionMax   // null counts as 0
  if mr == 0 && mp == 0  -> {invalidAdvanced}
  else if mp - mr < 5    -> {invalidAdvancedLess5}
  else null
  ```
- **jAt** (@512440) — **ineffective**:
  ```
  product.value !== an.NOA || standard === true || personalized === true || {invalidSequence}
  ```
  The same object-versus-string comparison makes the first clause always true. It returns `true`, which `Validators.compose`/mergeErrors drops, so it never errors.
- **YAt** (@513040) — every product:
  ```
  valid only if MR !== null && MP !== null && SP !== null && +MR <= +SP <= +MP
  otherwise {invalidStartPoint}
  ```
- **KAt** (@513260):
  ```
  f = seq1 && seq2                 // truthy test: 0 counts as missing
  if product.code == "002" (NOA): f = true
  if standard || !personalized: return false   // false = no error
  return f ? null : {invalidPersonalizedSequence}
  ```
  For NOA_TMJ a personalized sequence needs non-zero seq1 and seq2. **This is the only device-form error that blocks the doctor's flow.**
- Element validators (min/max) mark the form invalid but do not block the flow (see 1.0).

Other UI-side behaviour in the construction-data class:

- `initDefaultSplintValues` (@1175941):
  - For a product whose parent is CLASSIC with `lowerSplints == 2`: seq1 = 1000 (upper) and seq2 = 0 (lower).
  - For NOA when the invoice customer's `paymentOption == TRANSFER_BEFORE (4)` and standard is set: switch to personalized with seq1 = −1, seq2 = 1, seq3 = 2.
- `additionalSplint()` (@1182264) reveals P4, then P5, then P6 (maximum 3). Deleting one compacts the rest. The UI shows "Conlleva coste adicional" (additional cost).
- `render2Decimal` rounds to 1 decimal. `Vu` strips letters and turns `,` into `.`.
- `isValidLowerSplints` (@1187610) is used for repair products: with N = `product.lowerSplints`, seq1..seqN must be non-empty. Its error text is `msgValueIncorrect`.

### 1.4 Additional steps per product, from the construction-data template (@1190405)

| product (`an` code) | steps rendered |
|---|---|
| CLASSIC "001" (XBt) | `classic1Step`: MR, MP and advance. `classic2Step`: SP %/mm, the mandibular-advancement chart, vertical dimension, Morning Aligner checkbox. `classic3Step`: teeth status, images/files, observations. No sequence UI and no deviations. |
| NOA "002" / NOA_TMJ "003" (iUt) | `noa1Step` (MUt @1129601): MR, MP, advance, facial biotype (DE only), occlusion and protrusion deviations L/R. `noa2Step` (jUt @1141093): SP, sequence type, then a standard preview or personalized inputs, additional splints (personalized only), Morning Aligner. `noa3Step` (QUt @1145656): vertical dimension, frontal opening, elastic hooks, laterality, limit opening, upper/lower band 1–6, finish. `noa4Step` (oVt @1155001): teeth status, images/files, observations. |
| MORNING_ALIGNER "004" (sUt) | `morningAligner1Step` (gVt @1162007): only the info text "take a constructive bite in centric relation" and observations |
| ORTHOBRUX "005" (hUt) | `orthobrux1Step` (_Vt @1162804): type of guide, material, finish, upper or lower splint. `orthobrux2Step`: observations. |
| category REPAIR_READJUSTMENT (gUt) | `repair1Step`: the parent's splints, then N `app-input-sequence` controls; attachments upper/lower for code 250; images; observations |
| category ACCESSORIES (bUt) | `accessories1Step`: fork quantity (code 1003 only), observations |

Sequence display for NOA (`NUt` @1135126, `kUt` @1136003):

- Standard: read-only `SP, -1, 1`, plus `2` for NOA only. That is "1 superior + 4 inferiores" for NOA and "1+3" for NOA_TMJ. Nothing is sent: `sequence = {}`, mm units.
- Personalized: the unit radio, a fixed SP box, then inputs P1 and P2, plus P3 for NOA only.

### 1.5 Impressions/models form — `QN` (@516602), rendered by `app-treatment-form-models-option` (selector @1252560)

| control | default | validators |
|---|---|---|
| scannerPlatform | null | — | Enum name string from `bZ`, e.g. "MEDIT_LINK". Choosing a platform nulls scannerTreatment and vice versa. |
| scannerTreatment | null | — | Enum name string from `ba`, e.g. "MEDIT" or "UNKNOWN" |
| modelFiles | [] | — | Uploaded STL files `{file,name,modified}` |
| clinic | "" | — | Collection from a clinic |
| collectionRequest | false | — | "Recogida de impresiones" (impression pickup) |
| country, province, city, phone, name, address, postalCode | "" | — |
| email | "" | email |

Group validators:

- **ZAt** (@516862):
  ```
  if collectionRequest && clinic == "" and any of
     country, province, city, postalCode, address, email, phone, name is empty:
      {fieldIsEmpty}
  ```
  Province is always required here.
- **JAt** (@517175):
  ```
  pc = ES clinic postalCode, or form postalCode when country is ES
  if len(pc) == 5 and pc starts with 35, 38, 51 or 52:
      {incorrectPostalCode}     // Canarias, Ceuta, Melilla: no collection
  ```
- **tMt** (@517574):
  ```
  if collectionRequest and the country (or clinic country) is not ES(1) or PT(35):
      {incorrectCountry}
  ```

Modes (`app-traditional-printing-view` @1240601, `app-intraoral-scanner-view` @1209205):

- **Traditional**: physical impressions, with optional pickup. Pickup is allowed only for ES/PT (`isPermitedCountry` @1239291). Otherwise the default printing address comes from `GET /api/countries/traditionalPrintingCountries`. If there is none, the UI shows "OrthoApnea will contact you with a digital scanning centre".
- **Digital**: platform or scanner select, or upload STL.
- **Upload limits** (`app-drag-and-drop` @1093646): 0-byte files and an extension blacklist are rejected. The 500 MB total only turns the counter red.
- For CLASSIC, when `user.userDataApneadockDTO.classicTraditionalPrintingDisabled`, digital mode is forced.

### 1.6 Images/files — `KN` (@516482)

`{imagesAndFiles:[{}]}`, holding `{file,name,modified}` entries. There is no validator.

### 1.7 Teeth status — `app-teeth-status` (class @1087125, `D7` @354416)

- States: regular (Normal), crown, bridge, missing, implant, veneer, relieve. The default brush is "relieve".
- Rows: 1 = topLeft, 2 = topRight, 3 = bottomLeft, 4 = bottomRight. Position 1..8 maps to array index 0..7. The tooth name is `${row}${pos}`, which is the FDI number, so `topLeft[0]` is tooth 11.

### 1.8 Product selector — `app-product-selector` (class @1070663, `getListProduct` @1071412) and its modal (@1082306)

- It lists category APNEA_SNORE products sorted by `weight`.
- It removes products the user has disabled through `userDataApneadockDTO`: `classicDisable`, `noaDisable`, `noaTmjDisable`, `morningAlignnerDisable`, `orthobruxDisable`.
- It adds ACCESSORIES for doctors (KIT_OA only for staff).
- For a doctor with `orthobruxToOrtodock`, ORTHOBRUX redirects to ortodock.es instead (`setproductSelect` @1075001).
- `comingSoon` products cannot be selected.
- **Only one product per treatment.**

### 1.9 Promotion code — `app-promotioncode-configurator` (`callValidatorCode` @1258384)

- The code needs at least 5 characters. It is looked up with `GET /api/promotionCodes/findByCode/{code}`.
- It must be valid for the product's category or for `productIds`.
- If the promotion has `maxTimesPerUser`, the use count comes from `GET /api/promotionCodes/getTimesPerUser`.
- The control then holds the PromotionCode **object**.

---

## 2. Which validators apply to which product, and where the errors render

| error key | raised by | products | rendered where / condition | blocks? |
|---|---|---|---|---|
| fieldIsEmpty (delivery) | KJ | all | Per-field `fieldOtherAddressIsValid` shows `commonLabels.requiredValueMsg` under each alternative-address field (country, postalCode, province, city, address, name, email, phone) | yes (delivery tab) |
| customerNotValid | $N.a | all | `treatment.msgCustomerNotValid` once invoiceCustomer is touched | yes |
| clinicNotValid / required clinic | $N.s | all | `!fieldIsValid("clinic")` shows requiredValueMsg | yes |
| patientNotValid | $N.d | all | not rendered | yes |
| insuranceNumberNotValid | $N.f | DE invoice customer with socialSecuriryPatient | `treatment.insuranceNumberRequiredValueMsg` | yes |
| invalidPersonalizedSequence | KAt | personalized, not NOA (in practice NOA_TMJ) | `msgValueIncorrect` (`isValidPersonalizedSequence`, no validateForm gate) | **yes** (impressionAndModels tab) |
| invalidAdvanced | XAt | all, including MA, Orthobrux and accessories | `msgAdvanced0` behind `invalidForm()`, which needs validateForm, which is never true | no |
| invalidAdvancedLess5 | XAt | all | Only `treatment.leaveConstructorDataWithErrorLess5` in the dead modal | no |
| invalidStartPoint | YAt | all | `msgValueIncorrect`, needs validateForm, so hidden | no |
| invalidLimitOpening | $At | never fires | `msgValueIncorrect` | no |
| invalidSequence | jAt | never fires | `msgNullField` | no |
| min/max on MR, MP, laterality, limitOpening | element | all | `invalidField(...)` shows msgValueIncorrect, needs validateForm, so hidden. The UI clamps anyway. | no |
| MR > MP (not a validator) | `isMaxRetrusionBiggerMaxProtrusion` | CLASSIC, NOA, NOA_TMJ | `msgMaxRetrusionBiggerMaxProtrusion`, always shown when +MR > +MP | no (warning) |
| invalid lower splints | `isValidLowerSplints` | repair | msgValueIncorrect | no |
| fieldIsEmpty (models) | ZAt | traditional with pickup | requiredValueMsg per field (`fieldIsValid` in the traditional-printing view) | yes (Save button hidden) |
| incorrectPostalCode | JAt | ES pickup | `treatment.models.msgInvalidCollection` | yes |
| incorrectCountry | tMt | pickup outside ES/PT | `treatment.models.msgInvalidCollectionCountry` | yes |
| patient required / email | patient form | — | requiredValueMsg / emailErrMsg / `patients.existingName` | yes |

Conditional show/hide (construction data):

- `showMorningAlignerInput()` (@1187260): the product is CLASSIC, NOA or NOA_TMJ, **and** either the user is staff (not a distributor) or `!userDataApneadockDTO.morningAlignnerDisable`. When the box is checked the main image adds catalog/004.jpg. The box carries "additional cost".
- `showFacialBiotype()` (@1187458): the invoice customer's country is DE.
- Standard sequence input row: hidden if the customer's `paymentOption == TRANSFER_BEFORE`, meaning personalized is forced.
- The third standard and personalized value: NOA only.
- Additional splints: personalized only.
- Cam type: never shown.
- Delivery province: `ia(country).show`.
- Delivery insurance number: DE invoice customer with socialSecuriryPatient.
- Pickup and traditional printing: ES/PT only.

---

## 3. Request bodies

### 3.1 Create patient — `_c.add` (@484900): `POST /api/patient` with a JSON body

Edit uses `PUT /api/patient` with `id` added. The body is built by `createPatientForm()` (@4502056):

```
{ name, email, identityNumber, insuranceNumber,
  birthDate: hr(birthDate) -> "YYYY-MM-DDT00:00:00",
  male: true|false|""|null,
  phone, countryId: country.id|null, province, city, address, postalCode,
  userId: <jwt user id>,
  profession,
  observerId: observer?.userId, userDiagnosisId: userDiagnosis?.userId }
```

For a diagnosis doctor, `userId` and `userDiagnosisId` are swapped. The response carries `.id`, which the UI navigates to.

### 3.2 Create treatment — `br.add(t,r,a)` (@461459): `POST /api/treatments` as **multipart/form-data, not JSON**

- `FormData` field **`treatmentDTO`** holds `JSON.stringify(populateTreatmentDTO(treatment))`.
- `file` parts, one per file. The filename carries metadata as `<a>/<b>/<multimediaType>`, using `ro` (@384991):

  | kind | filename pattern | type |
  |---|---|---|
  | image or file | `<origName>/<name>/6` | IMAGES_AND_FILES |
  | STL model | `"<DD-MM-YY h:mm > <name>"/model<same>/4` | MODEL |
  | worksheet | `.../1` | WORKSHEET |
  | deleted file marker | blob "delete", name `delete?/<name>` | — |

  `ro` values: 0 NO_DEFINED, 1 WORKSHEET, 2 DIAGNOSIS_REPORT, 3 ADDITIONAL_DIAGNOSIS_REPORT, 4 MODEL, 5 ADJUSTMENT_OR_REPAIR, 6 IMAGES_AND_FILES, 7 MODEL_TECH, 8 REPORT, 9 HOME_DIAGNOSIS_REPORT, 10 CHAT, 11 DAP, 12 POST_TREATMENT_FEEDBACK, 13 PACKAGING_PHOTO.
- Options are `observe:"events", reportProgress:true`.
- The response `body` has `id` and `patient.id`. The UI then navigates to `recap-treatment/<patientId>/<id>`.
- Edit uses `PUT /api/treatments` with the same multipart shape. Status changes use `PUT /api/treatments/updateStatus?treatmentId&statusId&printerId[&viewer&originId&causeId]` with body `{message}`.

#### Form → DTO mapping (`ntt` @522530, then `populateTreatmentDTO` @470109)

Inputs to `ntt`: `n` = deliveryForm, `t` = deviceForm, `a` = modelsOptionForm, `s` = product, `d` = patient.

| JSON key | value / source |
|---|---|
| id | 0 for a new treatment (`yZ()` @357675) |
| customerId / customerName | `deliveryForm.invoiceCustomer.id` / `.name` |
| customerCountryId | 0 |
| fsDeliveryNoteId, fsBrandingId | from the treatment object (0) |
| user, creator | `{id:<jwt uid>, name:"", email:"", identityNumber:"", role:"", signupDate:null}` |
| responsible | `{id:null, …}` |
| clinic | `populateClinicDTO(deliveryForm.clinic)` (@473235): `{id,userId,customerId,postalCode,city,province,country,address,addressNumber,addressRest,addressObservations,contact,phone,sendSms,sms,sendEmail,email,fsClinicId,scannerList,name,from1,until1,from2,until2,deliveryFrom,deleted,billingOptions}` — the **full object** |
| product | the **full product object** (id, code, category, parent, typeId, lowerSplints, names…) |
| patientName | `deliveryForm.patient.name` |
| patientId | `patient.id` |
| statusId | **3** (MORE_INFORMATION_PENDING) from `yZ()`. Presumably set by the server. |
| lastActivity | null |
| desiredDate | `hr(deliveryForm.date)` = `"YYYY-MM-DDT00:00:00"` |
| expectedDeliveryDate | the same as desiredDate on create |
| requestDate | today, `"YYYY-MM-DDT00:00:00"` |
| teethStatus | deviceForm.teethStatus, a JSON **string** `{"bottomLeft":[8],"bottomRight":[8],"topLeft":[8],"topRight":[8]}`. Values: regular, crown, bridge, missing, implant, veneer, relieve. `""` if untouched. |
| observations | deviceForm.observations |
| multimedias | [] |
| collectionRequest | modelsOptionForm.collectionRequest |
| collectionAddress | `rtt` (@527709): if a clinic is chosen and collectionRequest, use `t1.fromClinicDTO(clinic)`. Otherwise use `_T(modelsOptionForm)` with `active = collectionRequest`. |
| deliveryAddress | `_T(deliveryForm)` (@527207), **always an object**: `{name,address,city,province,countryId: country.id or "", postalCode,phone,email, active: addressSend}`, plus `t1` defaults: `sendEmail:false, sendSms:false, sms:"", pickFrom1/pickUntil1/pickFrom2/pickUntil2:"", deliveryFrom:"", addressObservations:"", contact:"", type:0` |
| promotionCode | PromotionCode object or null |
| camType | false (see 1.3) |
| verticalDimension | 1000, 2000 or a number of mm |
| retrusionMax, protrusionMax, startingPoint | numbers in mm, rounded to 0.1 |
| theramonNeeded false, maxOpening 0 | |
| sequenceTypeStandard, sequenceTypePersonalized, sequenceUnitInMM | booleans |
| sequence | `gT(deviceForm)` (@526248): `{seq1..seq10}`, including **only non-empty** controls and passing each through `Vu`, which strips letters, turns `,` into `.` and converts to a number. `sequenceTypeP_n` becomes `seq<n>`. Additional splints are **seq4..seq6**. Standard gives `{}`. In mm units 0 = SP; in % units, a value equal to SP% means SP. 1000 (`bm`) = "upper". For CLASSIC, 0 = lower and 1000 = upper. |
| facialBiotype | "1" / "2" / "3" |
| deviationRight/AdvanceRight/Left/AdvanceLeft | numbers |
| laterality, limitOpening | number or null |
| anteriorFrontalOpening, mixedSplintDesign, scallopedSplintDesign, slotsForElasticBands | booleans |
| upperBandSplintDesign / lowerBandSplintDesign | `value \|\| 3`, i.e. 1..6 |
| scannerPlatform / scannerTreatment | enum name strings or null |
| fsDoctorId | `deliveryForm.fsDoctor.id` (user.fsDoctorId), or 0 |
| sendByMRW, collectByMRW, sendByUPS, collectByUPS | false |
| workSheets | [] (files go as parts) |
| techObservations | "" for doctors |
| parentTreatmentId | "" or id |
| archived / archivedCompensated / estimate | false |
| modelPrintStatusId | 0 |
| fsEntries | [] |
| productRepairAdjustment | null |
| productDiscount | 0 |
| onlyCollection / collectedMalaga | false |
| digitalFiles | 0 |
| materialBatch, productBatch, supplierDeliveryNote, sendNumber | "" |
| gtin | "" |
| doctorFirstTreatment | false |
| customerCare | "" |
| distributorSendAddressActive | from user data |
| distributorSendAddressId | 0 |
| insuranceNumber | see 1.0 |
| distributed | false |
| morningAligner | boolean (forced false unless CLASSIC/NOA/NOA_TMJ) |
| noContactDoctorForRedesign | boolean |
| separateFsDeliveryNoteForMAId | null |
| repairCauseUpperId / repairCauseLowerId | 0 |
| michiganTypeOfGuide, michiganLingualPalatineFinish, michiganMaterial | ints (see 1.3) |
| upperSplint / lowerSplint | `!upperLowerSplint` / `upperLowerSplint` |
| fsProductCode | "" |
| delayed | false |
| rate | null |
| rateObservation | "" |
| attachmentsUpper / attachmentsLower | booleans |
| doctorCriteria / commercialCriteria | false |
| paymentOption | null |
| accessories | `{quantity: accessoriesQuantity}` (`VC`) |
| editable:true, invoiceId:null, paid:false, billed:false, alreadyRequestTransportId:null | fixed |

These are **not** in the DTO: `startingPointPorcentage`, `addressSend` (it becomes `deliveryAddress.active`), `imagesAndFiles` and `stlFiles` (they become file parts), `additionalSplints`.

Other relevant endpoints:

- `POST /api/treatments/addFileModels` (multipart: `file` parts and `treatmentId`) adds files later.
- `POST /api/notifications` sends messages.

---

## 4. Status and action enums

### 4.1 `we`, the treatment status (@361672)

Labels come from i18n `treatmentStatus.<NAME>`. Ids 11–13 do not exist.

| id | name | es | en |
|---|---|---|---|
| 1 | SENT_APPLICATION | Solicitud enviada | Request sent |
| 2 | TRANSFER_PENDING | Pendiente de pago | Payment pending |
| 3 | MORE_INFORMATION_PENDING | Pendiente más información | Awaiting more information |
| 4 | NEW_PRINT_PENDING | Pendiente nueva impresión | Pending new impression |
| 5 | MANUFACTURING | En fabricación | Manufacturing |
| 6 | SENT_TREATMENT | Tratamiento enviado | Treatment sent |
| 7 | CANCELED | Tratamiento cancelado | Treatment cancelled |
| 8 | PLANNING | En planificación | Planning |
| 9 | PRINTING_3D | En impresión 3D | Printing 3D |
| 10 | CONFIRMATION_PENDING | Pendiente de confirmación | Confirmation pending |
| 14 | PRINTS_RECEIVED | Impresiones recibidas | Patient's impresions received |
| 15 | REPLANNING_PENDING | Pendiente de replanificación | Replanning pending |
| 16 | PLANNING_PENDING | Pendiente de planificación | Planning pending |
| 17 | QUALITY_CONTROL | Control de calidad final | Final quality control |
| 18 | IN_PRINT_QUEUE | En cola de impresión | In print queue |
| 19 | PLANNED | Planificado | Planned |
| 20 | ESTIMATE | Pendiente confirmar presupuesto | Pending confirmation of budget |
| 21 | COLLECTION | Recogida de impresiones | Collection of impressions |
| 22 | BIOCOMPATIBLE_PRINT | Impresión biocompatible | Biocompatible print |
| 23 | TO_BE_PACKED | Por empaquetar | To be packed |
| 24 | VERIFIED_TREATMENT | Solicitud verificada | Verified request |
| 25 | IN_PLANNING_CONTROL | En control planificación | In planning control |
| 26 | PRINT_CONTROL | Control impresión | Print control |
| 27 | SENT_TO_DISTRIBUTOR | Enviado a distribuidor | Sent to distributor |
| 28 | OBSERVER_PENDING | Pendiente observador | Observer pending |
| 29 | SENT_APPLICATION_TO_DISTRIBUTOR | Solicitud enviada al distribuidor | Request sent to distributor |
| 30 | ON_STANDBY | Tratamiento en espera | Treatment on Standby |
| 31 | END_BIOCOMPATIBLE_PRINT | Fin impresión biocompatible | End of biocompatible print |
| 32 | REPRINT_PENDING | Pendiente de reimpresión | Reprint pending |
| 33 | SEND_PENDING | Pendiente de enviar | Send pending |
| 34 | ACCEPTED_PLANNING | Planificación aceptada | Accepted planning |
| 35 | MODIFICATION_PENDING | Pendiente de modificación | Modification pending |
| 36 | DELIVERY_NOTE_REVIEW_PENDING | Pendiente revisión albarán | Delivery Note Review Pending |

`statusId` 0 or null shows as "EMPTY".

**What a doctor sees** (`Ns(statusId, role)` @365598 and `hN` @364528):

- For doctor roles (`Zl`) and for ROLE_DISTRIBUTOR, these internal statuses all **collapse to MANUFACTURING (5)**: 9, 16, 8, 25, 34, 35, 19, 18, 22, 31, 5, 26, 17, 15, 32, 23, 33.
- For doctors, SENT_TO_DISTRIBUTOR (27) also collapses to MANUFACTURING. A distributor still sees 27.
- So the statuses visible to a doctor are: 1, 29, 28, 24, 7, 21, 14, 20, 2, 3, 4, 10, 36, 30, 5, 6. This is the `gv()` filter list (@363136).
- Terminal: 6 SENT_TREATMENT and 7 CANCELED. Only status 3 lets the doctor edit (`nct`).

### 4.2 `Fn`, the notification/history action (@347491)

| id | action |
|---|---|
| 1 | NEW_TREATMENT |
| 2 | UPDATE_TREATMENT |
| 3 | CHANGE_STATUS_SENT_APPLICATION |
| 4 | CHANGE_STATUS_TRANSFER_PENDING |
| 5 | CHANGE_STATUS_MORE_INFORMATION_PENDING |
| 6 | CHANGE_STATUS_NEW_PRINT_PENDING |
| 7 | CHANGE_STATUS_MANUFACTURING |
| 8 | CHANGE_STATUS_SENT_TREATMENT |
| 9 | UPDATE_EXPECTED_DELIVERY_DATE |
| 10 | NEW_DOCTOR |
| 11 | MESSAGE |
| 12 | DELAYED |
| 13 | ADD_FILES_TREATMENT |
| 14 | DELIVERYNOTE_SENT |
| 15 | ORDER_COLLECTION |
| 16 | CLOSE_DELIVERY_NOTE |
| 17 | OPEN_DELIVERY_NOTE |
| 18 | POST_TREATMENT_FEEDBACK_CREATED |
| 101 | CHANGE_STATUS_CANCELED |
| 102 | …_PLANNING |
| 103 | …_PRINTING_3D |
| 104 | …_CONFIRMATION_PENDING |
| 105 | …_PRINTS_RECEIVED |
| 106 | PRINTS_NOT_RECEIVED |
| 107 | …_REPLANNING_PENDING |
| 108 | …_PLANNING_PENDING |
| 109 | …_QUALITY_CONTROL |
| 110 | …_IN_PRINT_QUEUE |
| 111 | …_PLANNED |
| 112 | …_ESTIMATE |
| 113 | …_COLLECTION |
| 114 | …_BIOCOMPATIBLE_PRINT |
| 115 | …_TO_BE_PACKED |
| 116 | …_VERIFIED_TREATMENT |
| 117 | …_IN_PLANNING_CONTROL |
| 118 | …_PRINT_CONTROL |
| 119 | …_SENT_TO_DISTRIBUTOR |
| 120 | …_OBSERVER_PENDING |
| 121 | …_SENT_APPLICATION_TO_DISTRIBUTOR |
| 122 | …_ON_STANDBY |
| 123 | …_END_BIOCOMPATIBLE_PRINT |
| 124 | …_REPRINT_PENDING |
| 125 | …_SEND_PENDING |
| 126 | …_ACCEPTED_PLANNING |
| 127 | …_MODIFICATION_PENDING |
| 128 | …_DELIVERY_NOTE_REVIEW_PENDING |
| 301 | CUSTOMER_CARE |
| 302 | TECH_OBSERVATIONS |
| 303 | ENABLED_SHOW_INVOICES |
| 304 | PAYMENT_LINK_GENERATED |
| 305 | PAYMENT_MADE |

- Notifications carry `action` as the **name string**. `getTreatmentStatusOfNoticationAction` (@710170) maps `CHANGE_STATUS_X` to `we.X`, then applies `Ns()` for the role.
- Labels: `notificationLabel.<ACTION>` and `<ACTION>_TEXT`. There are 110 keys, and most CHANGE_STATUS_* labels read "CAMBIO DE ESTADO".
- `_i`, the message type (@350740): 0 NONE, 1 TECH→DOCTOR, 2 DOCTOR→TECH, 3 TECH→DISTRIB, 4 DISTRIB→TECH, 5 DOCTOR→DISTRIB, 6 DISTRIB→DOCTOR, 7 TECH→DOCTOR_VIEWER, 8 DOCTOR→TECH_VIEWER, 9 DISTRIB→TECH_VIEWER.
- History `typeId` (`Uu` @377476): 0 EMPTY, 1 TREATMENT_TECH_OBSERVATIONS, 2 TREATMENT_LOGISTICS, 3 TREATMENT_CHANGE.
- History `subTypeId` (`er` @377686, the changed field): 1 EXPECTED_DELIVERY_DATE, 2 PRODUCT_ID, 10 RETRUSION_MAX, 20 PROTUSION_MAX, 30 STARTING_POINT, 40 THERAMON_NEEDED, 50 MAX_OPENING, 60 SEQUENCE_TYPE_STANDARD, 70 SECUENCE_TYPE_PERSONALIZED, 80–110 deviations, 120 LATERALITY, 130 LIMIT_OPENING, 140 SEQUENCE, 150 SCANNER_PLATFORM_ID, 160 COLLECTION_ADDRESSS, 170 DELIVERY_ADDRESS, 180 RESPONSIBLE_ID, … 390 MORNING_ALIGNER, 400 SEQUENCE_UNIT_IN_MM, 430–450 MICHIGAN_*, 460 FACIAL_BIOPYPE, 470 UPPER_SPLINT, 480 LOWER_SPLINT, 485 CAM_TYPE, 490 VERTICAL_DIMENSION, 500 RATE, 510 RATE_OBSERVATION, 520 ATTACHMENTS, 521 ATTACHMENTS_LOWER, 522 DOCTOR_CRITERIA, 524 COMMERCIAL_CRITERIA, 530 TEETH_STATUS, 540 OBSERVATIONS.

### 4.3 Status-change cause and other enums (@350740–354400)

- `kC` origin: WORK_ENTRY 10 … OTHERS 60.
- `vs` MORE_INFORMATION_PENDING cause: 10 DESIGN_CHANGE_PROPOSAL, 20 ATTACHES_PROPOSAL, 30 DEVICE_CHANGE_PROPOSAL, 40 OCCLUSION_BITE, 50 LACK_OF_VERTICAL_DIMENSION, 60 MIDLINE_DEVIATION, 70 MISSING_RECORDS_IMPRESSIONS, 80 MISSING_XRAY, 90 MISSING_CONSTRUCTION_DATA, 100 NOT_FOUND_ON_SCANNER_PLATFORM, 110 OTHER_BITE_IMPRESSION_ERRORS, 120 OTHER_PROPOSALS_DUE_TO_LACK_OF_RETENTION, 130 OTHERS.
- `FC` ON_STANDBY cause: 10 polygraph results, 20 patient payment to doctor, 30 patient payment to OrthoApnea, 40 others.
- `qC` CANCELED cause: 10 duplicate, 20 prescription error, 30 doctor request, 40 test treatment, 50 poor retention, 60 others.
- `li` repair causes, @351xxx.
- `cs` (@343673) is the **commercial-register** status (1 PENDING, 2 COMPLETED, 3 STOPPED, 4 CANCELLED, 5 DELETED). It is not a treatment status.
- `$f` modelPrintStatus: 0 IDLE, 1 PRINTING, 2 PRINTED.
- `e1` digitalFiles: 1 TRADITIONAL, 2 TRADITIONAL_STL, 3 DIGITAL, 4 DIGITAL_STL, 5 STL.
- `ls` paymentOption (@340142): 0 EMPTY, 1 DIRECT_BILL, 2 CASH_ON_DELIVERY, 3 TRANSFER, 4 TRANSFER_BEFORE, 5 CASH, 6 CREDIT_CARD, 7 COMPENSATED, 8 CONFIRMING.
- `us` branding: 1 ALINEADENT, 2 LABORATORIO, 3 ORTHOAPNEA, 4 IMEDICAL, 5 ORTHOAPNEA_GE.
- Shipment tracking (`E7` and `xZ`, @366500): if `sendNumber` has length 12 and starts with "0" it is MRW; "1Z…" is UPS; "CU…" is Correos. Tracking URLs are built from these.

### 4.4 Products

- `an` codes (@344909): CLASSIC 001, NOA 002, NOA_TMJ 003, MORNING_ALIGNER 004, ORTHOBRUX 005.
- 101–105: classic repairs and readjustments.
- 201–224 and 240/241: NOA additional splints, reprints, readjust and replanning, and the standard/customized 1–4 additional set.
- 250 ATTACHEMENTS_TEMPLATE.
- 301–323: TMJ variants.
- 1001 KIT_OA, 1002 GAUGES_SET, 1003 FORK.
- `Oi` category (@344678): 10 APNEA_SNORE, 101 WITHOUT_CATEGORY, 102 REPAIR_READJUSTMENT, 103 ADDITIONAL, 104 ACCESSORIES. The DTO carries the **name string**.
- `Er` typeId (@346760): 0 EMPTY, 1 ADDITIONAL_SPLINT, 2 REPLANNING, 3 REPRINT, 4 READJUST, 11 REPOSITIONING_CLASSIC_SCREW, 12 ADDITIONAL_SET, 20 ATTACHEMENTS_TEMPLATE.
- `bZ` scanner platforms (@360517): 1 SHAPE_COMMUNICATE, 2 SIRONA_CONNECT, 3 ITERO_RESTAURATIVE, 4 CSCONNECT, 5 MEDIT_LINK, 6 DWOS_CONNECT, 7 HERON_CLOUD, 8 ROMEXIS_CLOUD, 9 SHINING_3D_DENTAL_CLOUD, 10 DEXIS_IS.
- `ba` scanners (@360931): 1 SHAPE_TRIOS, 2 SHAPE_DESK_SCANNER, 4 SIRONA, 5 CARESTREAM, 6 MEDIT, 7 DENTALWINGS, 8 ITERO, 9 HERON, 10 PLANMECA_EMERALD, 11 EXOCAD_DESK_SCANNER, 12 IMETRIC_DESK_SCANNER, 15 FINOSCAN_RELATION_DESK_SCANNER, 16 DENTALWINGS_SERIES_3_DESK_SCANNER, 17 AORALSCAN_SHINING_3D, 18 SHINING_3D, 19 NEOSCAN_1000, 20 UNKNOWN, 21 UNKNOWN_DESK.
- Both scanner enums are sent as **names** (the `Object.keys` second half, @1207819).

---

## 5. API paths

Base is `/api/` (const `vo` @332843) and media is `/media/`. **R** = read-only GET, and ★ marks paths that reveal reference data or enums.

**Auth / user**
- POST /api/login. Basic auth plus `X-Requested-With`, and the response is a JWT.
- Every later request uses `Authorization: Bearer <jwt>`. A 403 with header `Token-Expired: true` means a new login (interceptor @539688).
- R ★ GET /api/user/me
- R GET /api/user/{id}
- R GET /api/user/findByEmail/{email}
- R GET /api/user/registeredDoctor/{fsDoctorId}
- R GET /api/user/has-pending-payments/{id}
- R GET /api/user/me/distributor/country/{id}
- POST /api/user/signup, /add, /signupDistributorDoctor, /signupTech, /updateDistributorDoctor, /blockUser, /changePassword, /changeSettings, /changeLanguage, /forgottenPassword, /sendEmailValidationUser
- PUT /api/user, /user/changePhoto, /user/{id}/role, /user/{id}/updateUserDataApneaDock, /user/{id}/validateUserEmail, /user/{id}/observerDisabled
- Admin: GET /api/user/alltech, /techlist (POST), /users, /findDoctorsByParams, /doctorTreatment, /role/Excel, /searchBasicDoctors

**Reference data (R ★)**
- GET /api/countries — the countries list, with `id` and `code`.
- GET /api/countries/{id}
- GET /api/countries/traditionalPrintingCountries — default printing addresses per country.
- GET /api/address/regions/findByCountryId?countryId= — provinces/states.
- GET /api/address/postalCodes/findByCodeAndCountryId?code=&countryId= — postal codes, giving region and city. Only used for ES in the UI.
- GET /api/products?page=&size= — the full catalog with categories, parents, typeId and lowerSplints.
- GET /api/products/{id}, /products/code/{code}, /products/category/{cat}?customerId=, /products/children?treatmentId=, /products/fsDoctor?productId=&fsDoctorId=
- GET /api/products/manufacturingDate?productId=&fsDoctorId= — minimum desired date.
- GET /api/products/addWorkingDays?date=&days=
- GET /api/products/names?brandingId=, /namesWithPrice?customerId=, /fsProduct/{code}?brandingId=
- GET /api/clinics?userId=&deleted=, /clinics/findByUserClinicId?id=, /clinics/findFSClinicById?id=
- GET /api/customers/{id}, /customers/balance/{id}, /customers/users/{id}, /customers/basiclist, /customers/cif/{cif}, /customers/spanish-identity-number-checker?nif=&businessName=, /customers/vat-customer-checker?nif=&countryCode=
- GET /api/promotionCodes/findByCode/{code}, /promotionCodes/getTimesPerUser
- GET /api/parameter, /parameter/{key}
- GET /api/defaultDevice/findByUserId?userId= — the doctor's default device configuration per product, applied by `tR` on product change.
- GET /api/resources

**Patient**
- R GET /api/patient/{id}
- R GET /api/patient/find (params: id, patientName, doctorName, …, page, size)
- R GET /api/patient/findBasic?id=&patientName=&doctorName=&userId=&page=&size=
- POST /api/patient (JSON)
- PUT /api/patient (JSON)
- Diagnosis: GET /api/diagnosis/{id}, /diagnosis/patient, /diagnosis/observerPatient, /diagnosis/externalDiagnosis; POST/PUT /api/diagnosis; POST /diagnosis/uploadHomeDiagnosisReports, /diagnosis/externalDiagnosis

**Treatments**
- POST /api/treatments — multipart, `treatmentDTO` plus `file` parts.
- PUT /api/treatments — multipart.
- R ★ GET /api/treatments/DTO/{id}?updateDeliveryNote= — full DTO with notifications and histories.
- R GET /api/treatments/DTO?treatmentSearchForm=<json>&page=&size= — list. The search form (`xm` @366800) includes `status[]`, `productCodes[]`, `fromDate` and others.
- R GET /api/treatments/byPatient/{patientId}?page=&size=
- R GET /api/treatments/byTreatmentParentId/{id}
- R GET /api/treatments/pendingTreatmentSmallDTO
- R GET /api/treatments/{id}/deliveryNoteInfo, /{id}/tpvPayable, /{id}/tpvInvoiceInfo
- R GET /api/treatments/deliveryNote?deliveryNoteId=, /deliveryNote/download, /declarationConformity/download, /udi-label/download
- R GET /api/treatments/multimedia/{id} (zip), /registerLock, /brandingIdNewTreatment/{id}, /productList, /manufactoring-times
- R GET stats: /changeStatus, /stats*
- R GET /api/treatments/DTORate, /Excel, /ExcelRate, /total-cost, /archived-total-cost, /archived-compensated-total-cost, /completed-treatment-summary-by-user, /findCustomerTreatment, /customerTreatmentExcel, /numberByPromotionId, /promotionId(s), /treatmentsByPromotionExcel, /digitalTreatmentDistinctDoctorList and its Excel
- POST /api/treatments/addFileModels (multipart), /deliveryNoteEntries, /getUserTreatmentCounts, /getUserPendingTreatmentCounts
- PUT /api/treatments/updateStatus?treatmentId&statusId&printerId[&viewer&originId&causeId] (body `{message}`)
- PUT /api/treatments/updateStatusObserver, /updateModelPrintStatus, /updateResponsible, /updateSendNumber, /updateTechObservations/{id}, /{id}/updateCustomerCare, /updateMaterialBatch, /updateProductBatch, /updateScannerTreatment, /updateRepairCauseUpper, /updateRepairCauseLower, /{id}/updateAttachmentsUpper, /{id}/updateAttachmentsLower, /{id}/updateDoctorCriteria, /{id}/updateCommercialCriteria, /updateExpectedDeliveryDate, /expectedDeliveryChangeSendMail, /closed/{id}, /deliveryNoteClose/{id}, /deliveryNoteOpen/{id}, /collectMalaga, /checkTreatmentPaid
- PUT payments: /{id}/payment, /{id}/payment-invoice, /payment-card-registration, /payment-buy-with-token, /{id}/createPayPalPayment, /{id}/executePayPalPayment
- GET /api/download/work?treatmentId=&locale=&isDoctor=
- POST /api/download/history

**Notifications / history**
- R GET /api/notifications/userId/{id}, /notifications/unread, /notifications/getStatsChangeStatusTreatment
- POST /api/notifications — a message to the technician, which emails them.
- PUT /api/notifications/{id} — mark as read.
- R GET /api/history/treatmentId, /history/findByParams
- POST/PUT /api/history
- R GET /api/postTreatmentFeedback/treatment/{id}
- POST /api/postTreatmentFeedback

**Other areas** (internal or staff)
- /api/invoice/*: find, download, downloadCreditNote, downloadInvoiceList, findByDeliveryNoteId, Excel
- /api/payment/*
- /api/MRW/*, /api/UPS/*
- /api/printers/*
- /api/register/* (manufacturing registers)
- /api/commercial/*
- /api/event/*
- /api/potentialUser/*
- /api/promotions/*
- /api/stats/*
- /api/retentionMachine/*
- /api/admin/*
- /api/file
- /api/frontLog
- /api/additionalLog

**Media** (GET)
- /media/catalog/<code>.jpg
- /media/patients/<patientId>/treatments/<id>/<file>
- /media/wallpaper/…

The safest first reads to resolve open enums are `/api/countries` (gives the MX id), `/api/products?page=0&size=1000`, `/api/user/me`, `/api/clinics?userId=`, `/api/countries/traditionalPrintingCountries`, `/api/address/regions/findByCountryId?countryId=<MX>`, `/api/defaultDevice/findByUserId`, and `/api/products/manufacturingDate`.

---

## 6. Error and help texts (es / en)

| key | es | en |
|---|---|---|
| commonLabels.requiredValueMsg | Este campo es necesario. | Required field |
| commonLabels.emailErrMsg | El correo facilitado no es válido | Invalid email. |
| patients.existingName | Nombre del paciente ya existente. Elija otro nombre. | Existing patient name. Choose another name. |
| patients.inValidEmail / validEmail | Email no correcto / Email correcto | Incorrect email / Correct email |
| treatment.msgCustomerNotValid | Clíente no válido, seleccione un cliente de la lista | Customer not valid, select a customer from the list |
| treatment.insuranceNumberRequiredValueMsg | Para realizar el trabajo sobre la facturación señalada debe facilitarnos el número del asegurado. | To order the work on the billing information indicated, you must provide us with the insurance number. |
| treatment.formDelivery.deliveryDaterequiredValueMsg | La fecha es necesaria y ha de ser posterior a la actual | The date is neccesary and it must be after todays date |
| treatment.productDetails.msgValueIncorrect (invalidStartPoint, invalidPersonalizedSequence, invalidLimitOpening, min/max) | Valor incorrecto | Incorrect value |
| treatment.productDetails.msgMaxRetrusionBiggerMaxProtrusion | La máxima retrusión debe ser menor que la máxima protrusión | The maximum retrusion must be lower than the maximum protrusion |
| treatment.productDetails.msgAdvanced0 (invalidAdvanced) | Avance mandibular no puede ser 0 | The mandibular advancement can not be 0 |
| treatment.leaveConstructorDataWithError (invalidAdvanced, modal) | Avance mandibular debe ser mayor que 0. Si pulsa en siguiente, se establecerá la posición inicial mandibular en protrusiva según al registro de mordida anexado al tratamiento. | The mandibular advancement must be greater than 0. If you click Next, initial mandibular protrusion will be set according to the bite registration recorded in the treatment. |
| treatment.leaveConstructorDataWithErrorLess5 (invalidAdvancedLess5) | Rango de avance mandibular es inferior a 5. Se ruega revisar la mordida antes de continuar … | The mandibular advancement range is less than 5. Please review the bite prior to continue … |
| treatment.productDetails.msgNullField (invalidSequence) | Debe seleccionar un campo | Select a field |
| treatment.models.msgInvalidCollection (incorrectPostalCode) | Lo sentimos, no se permiten recogidas para Canarias, Ceuta o Melilla | Sorry, we can not organize collections from the Canary Islands, Ceuta or Melilla |
| treatment.models.msgInvalidCollectionCountry (incorrectCountry) | Lo sentimos, no se permiten recogidas fuera de España | Sorry, we can not organize collections outside mainland Spain |
| treatment.modelsOption.msgNoPrintingAddress | El Equipo de OrthoApnea se pondrá en contacto con usted para facilitarle los datos de un centro de scaneado digital. | The OrthoApnea Team will contact you with details of a digital scanning centre. |
| commonLabels.fileSizeNull | Archivo con un tamaño de 0 bytes | A0 byte file |
| commonLabels.notAllowedExtension | Extensión de archivo no permitida. | Invalid file extension. |
| commonLabels.messageErrorCreateTreatment | Ocurrió un error al crear el tratamiento. | Error while creating treatment. |
| commonLabels.messageErrorCreatePatient | Ocurrió un error al crear el paciente. | Error while creating patient. |

Help texts:

| key | es | en |
|---|---|---|
| msgDistal | Poner el valor en negativo si los incisivos inferiores están hacia distal respecto a los superiores. | Set to negative the value if the lower incisors are distal from the upper incisors. |
| msgRemember | Las medidas indicadas en mm son respecto al SP y las medidas indicadas en % son respecto al rango de avance mandibular. | The measurements indicated in mm are relative to the SP and the measurements indicated in % are relative to the mandibular advancement range. |
| startingPointDes | El SP equivale al registro de la mordida constructiva. | The SP is equivalent to the constructive bite registration. |
| limitOpeningInfo | Rango de 0-12 mm. Estándar 7 mm. | Range of 0-12 mm. Standard 7 mm. |
| lateralityInfo | Rango de 0-5 mm. Estándar 3 mm. | Range of 0-5 mm. Standard 3 mm. |
| standardDes | (1 superior + 4 inferiores) | (1 upper + 4 lower) |
| standardDesNoaTmj | (1 superior + 3 inferiores) | (1 upper + 3 lower) |
| additionalCost | Conlleva coste adicional | Additional cost involved |
| advanceInfo | Indique el avance en mm. o % de las férulas adicionales solicitadas | Indicate the progress in mm or % of the requested additional splints |
| verticalDimension.registration / minimum | Registro / Mínima | Registration / Minimum |
| morningAlignerInfo2 | Recuerde tomar una mordida constructiva en la posición de relación céntrica. | Remember to take a constructive bite in the centric relation position. |
| facialBiotype.info4 | Si no se selecciona ninguna opción, se considerará mesofacial por defecto. | If no option is selected, the patient will be considered as mesofacial. |

Server failures show only a generic toast. The interceptor maps 500 to `error500` and 504 to `error504`. **No server error body is ever displayed.**

---

## 7. Country ids and per-country rules

The constants are at @335471:

| var | country | id |
|---|---|---|
| `is` | ES | 1 |
| `vm` | DE | 15 |
| `ng` | FR | 19 |
| `Q0` | GB | 20 |
| `ym` | PT | 35 |
| `RSt` | CA | 47 |
| `eZ` | US | 53 |

**MX has no constant.** Its id must come from `GET /api/countries`. Our notes say 29, which is unverified. The `52:"MX"` string at @5150026 is only an xlsx library codepage table.

Rules:

- **`ia(id)`** (@335829):
  - CA, ES and DE: province shown and required, labelled "Provincia".
  - US: shown and required, labelled "Estado".
  - **Everything else, MX included: province hidden and not required.**
  - This drives the KJ alternative-address check, the patient form display and the transport-address form.
- **Collection of impressions** (pickup) is allowed only in ES and PT. ES postal codes starting 35, 38, 51 or 52 are refused.
- Traditional-printing default address: per country, from `/countries/traditionalPrintingCountries`. Otherwise "we'll contact you about a scanning centre", which is what MX would get unless configured.
- **DE**: facial biotype shown. If the invoice customer has socialSecuriryPatient, the treatment insurance number is required with at least 3 characters.
- **FR/ES**: if the invoice customer has socialSecuriryPatient, the patient's insuranceNumber is copied to the treatment. `FR`/`qR` (@1045424) mark a patient as "insurance patient" when it has insuranceNumber, a country of FR or ES, and a customerId.
- **FR patient**: when insuranceNumber is set, address, postalCode and city become required.
- Postal code lookup (province/city autofill) and a 5-digit pattern are used for ES only.
- **No phone validation anywhere.** No postal-code length rule except the ES checks.

---

## 8. Differences vs our wizard

Files compared: `OrthoApneaOrderWizard.vue`, `useOrthoApneaOrderWizard.ts`, and the backend pass-through `apps/api/src/services/partners/orthoapnea.ts` `createOrthoApneaTreatment` (JSON `POST /api/treatments`).

### Transport and shape (likely to break the order)

1. **Content type.** OA posts `multipart/form-data` with a `treatmentDTO` JSON-string part plus `file` parts. We post `application/json`. Whether the server accepts a JSON body is unknown (§9).
2. **No patient link.** We send no `patientId` or `patientName`, and no `customerId`, `customerName`, `user`, `creator`, `responsible`, `fsDoctorId` or `requestDate`. OA always sends `patientId` (the OA patient id from `/patients/{id}/ensure`) and `patientName`. Without them the order has no patient.
3. **`clinic`.** We send a bare number. OA sends the full ClinicDTO object (`populateClinicDTO`). The OA server probably needs the object or at least `{id}`.
4. **Delivery address.**

   | aspect | OA | ours |
   |---|---|---|
   | which address | `deliveryAddress.active` (bool) | top-level `addressSend: "clinic"\|"alternative"`, a key OA does not have |
   | country key | `countryId` | `country` |
   | when shipping to clinic | still an object with `active:false` | `null` |
   | extra keys | `province`, `t1` defaults (`sendEmail`, `sendSms`, `sms`, `pickFrom1..`, `contact`, `type:0`) | none |

   OA's own edit screen reads `n.deliveryAddress.active` without a null check (`YN` @515285), so a null may break their UI.
5. **`product`.** We send `{id}`. OA sends the full product object (code, category, parent, typeId, lowerSplints). The server may read `product.code` or `category`.
6. **`teethStatus`.** We send an array of FDI strings such as `["11","26"]`. OA expects a JSON **string** `{"topLeft":[8],"topRight":[8],"bottomLeft":[8],"bottomRight":[8]}` with values regular, relieve, crown and so on. Row 1 is topLeft (FDI 1x), 2 topRight (2x), 3 bottomLeft (3x), 4 bottomRight (4x), and array index = tooth digit − 1. Our array will not deserialize into a String field.
7. **`verticalDimension`.** We send `"minimal"` or `"registro"`. OA uses numbers: **1000 = Registro (the default)**, 2000 = Mínima, otherwise mm 0..20. We send nothing by default, but OA always sends 1000.
8. **Band designs.** We send `upperBandSplintDesign` and `lowerBandSplintDesign` as strings "1".."6", or omit them. OA uses numbers and sends **3 when unset**.
9. **`desiredDate`.** We send `"YYYY-MM-DD"` set to today + 15. OA sends `"YYYY-MM-DDT00:00:00"`, and the default is the server minimum from `GET /api/products/manufacturingDate`. OA also sets `expectedDeliveryDate` to the same value.
10. **Starting point.** We send `startingPointPorcentage`, which OA does not have, and allow `startingPoint: null`. OA sends only `startingPoint` in mm, computed as `MR + %·(MP−MR)/100` when the doctor typed a %. **An order entered in % from our wizard reaches OA with no SP.**
11. **Additional splints.** We send `additionalSplints: string[]`, which OA does not have. OA puts additional splints in `sequence.seq4..seq6` (personalized only, at most 3, numeric, same unit as the sequence).
12. **`sequence`.** OA sends only non-empty `seqN` keys, as numbers.
    - Standard is `{}` with **`sequenceUnitInMM: true`**. Our standard sends `sequence: null` with `sequenceUnitInMM: false`.
    - OA's real standard is SP, −1, +1, +2 mm for NOA (1 upper + 4 lower) and SP, −1, +1 for NOA_TMJ. Our "standard" shows 60/70/80, which is wrong.
    - Personalized NOA_TMJ has only seq1 and seq2. CLASSIC has no sequence UI.
    - Our default is personalized + % + 60/70/80. OA's default is standard + mm.
13. **Promotion code.** We send a string. OA sends the PromotionCode object from `GET /api/promotionCodes/findByCode/{code}`, after its product and usage checks.
14. **Morning Aligner.** In OA it is a **flag** (`morningAligner: true`) on a CLASSIC, NOA or NOA_TMJ order, at additional cost. It is forced false for every other product. It is not a second product order. Our watcher adds the MA product (004) as a **separate order** when the box is checked, and sends `morningAligner: true` on every product's payload, including the MA order itself. **Risk of double-ordering MA.**
15. **One product per treatment.** OA has a single product selector. Our multi-product loop is our own invention, which is acceptable (one order per product), but OA never sends Orthobrux or MA settings mixed with NOA fields.
16. **Fields we never send that OA always sends:**
    - `camType: false`, `facialBiotype: "1"`, `theramonNeeded: false`, `maxOpening: 0`
    - `scannerPlatform` and `scannerTreatment` as enum names. **Our scanner choice and `registrationMethod` are collected but never sent.** Our SCANNER_OPTIONS are display labels, not enum names.
    - `collectionRequest`, `collectionAddress`
    - `michiganTypeOfGuide`, `michiganLingualPalatineFinish`, `michiganMaterial`, `upperSplint`, `lowerSplint` (needed for Orthobrux)
    - `accessories {quantity}`, `attachmentsUpper/Lower`, `statusId: 3`, `editable`, `paid`, `billed`, `fsEntries: []`, `insuranceNumber`, `distributorSendAddressActive`, `archived`, `estimate`, `productDiscount`, `techObservations`
17. **Product-specific steps.** We show NOA's MR/MP, SP, sequence, band and finish fields for every product. OA shows:
    - CLASSIC: MR/MP, then SP + vertical dimension + MA, then teeth.
    - MA: observations only.
    - Orthobrux: guide, material, finish, upper or lower.
    - Accessories: quantity.
    - Repair/additional: N sequence inputs.

### Validation rules OA has that we lack (or differ)

- **Alternative address**: OA also requires **phone**, plus province for CA/ES/DE/US. Name allows at most 40 characters, which we match. Email format is checked.
- **MR/MP**: OA allows −20..20 via validators, clamps in the UI, and rounds to 0.1. It treats MR = MP = 0 as `invalidAdvanced` and MP − MR < 5 as `invalidAdvancedLess5`. It **requires SP between MR and MP and non-null** (`invalidStartPoint`). None of these block OA's own doctor UI except the warning, but they are the intended rules. We enforce MR < MP strictly and the ±20 range, but have no SP rule and no MP − MR ≥ 5 warning.
- **Personalized sequence** (NOA_TMJ): seq1 and seq2 must be non-zero and present. This is the only device rule that blocks in OA. Its truthiness test means 0 counts as missing.
- **Laterality** 0..5 (default 3). **Limit opening** 0..12 (default 7). The SP% field allows 0..100. Our NumberStepperFields have no bounds.
- **Deviation pairs**: setting left zeroes right, and vice versa.
- **Patient**:
  - OA requires name, **birthDate** and **country**. The name must be unique per doctor.
  - Our `ensureOrthoApneaPatient` sends `birthDate: ""` and `male: ""` and relies on server leniency.
  - Under the user flag `alternativePatientForm`, gender, phone, province, city, address and postalCode are also required.
- **Pickup (traditional impressions)**: ES/PT only. We offer "impression" for MX with no pickup or address data. OA would show "we'll contact you about a scanning centre" for MX unless a traditional-printing address exists for that country.
- **Product availability**: filtered by user flags (`noaDisable`, `morningAlignnerDisable` and others) and `comingSoon`. We filter by name only.
- **Desired date**: OA's minimum comes from the server (manufacturingDate). Ours is a fixed +15 days.

---

## 9. Still unknown — needs a live order to learn

1. Whether `POST /api/treatments` accepts `application/json` at all, or only multipart with a `treatmentDTO` part. This decides whether today's backend call works.
2. **Server-side validation** rules: which fields are mandatory (patientId, clinic, product.code, deliveryAddress), and whether invalidAdvanced, SP range or sequence are re-checked server-side. The client blocks almost nothing on the device form.
3. The **error response format**: status codes (the UI enum mentions 400, 401, 403, 404, 409 INVALID_PARAM) and body shape. The UI never shows the body.
4. Whether Jackson fails on unknown keys (`addressSend`, `startingPointPorcentage`, `additionalSplints`, `deliveryAddress.country`) and on type mismatches (`teethStatus` array, `verticalDimension` string, `clinic` number, `promotionCode` string).
5. What the server does with the client-sent `statusId: 3`, `requestDate` and `expectedDeliveryDate`, i.e. what the initial status of a doctor order actually is (likely SENT_APPLICATION 1 or TRANSFER_PENDING 2, depending on the customer's paymentOption).
6. The minimal product object the server needs (`{id}` or `{id, code, category}`).
7. The MX country id (`/api/countries`), whether MX has a traditional-printing default address, and whether MX regions exist in `/address/regions`.
8. Whether `deliveryAddress: null` (clinic shipping) is accepted, or whether OA needs `{active:false,…}`.
9. Behaviour when `patientId` points to a patient owned by a different OA user or customer.
10. The invoice customer (`customerId`) for the shared account: OA's UI requires a validated customer. We send none.
11. Response body shape of POST /api/treatments: the UI reads `body.id` and `body.patient.id`.
12. Pricing and side effects of the morningAligner flag and of additional splints seq4..6 (both "additional cost"). Whether a separate MA product (004) order plus `morningAligner: true` on NOA double-bills.

## Live order results

Filled in after each approved test order (raw: `.claude/local/oa-shots/shot-N.result.json`). Scrubbed copies become the OA replica fixtures (CORE-95).

### Results 2026-10-03

Shots S1, S3 and S4 were approved by Łukasz and sent. S2 was skipped, because nobody at OA changes a status before Monday. Raw records are in `.claude/local/oa-shots/`. Scrubbed fixtures are in `apps/api/test/oa-replica/fixtures/`.

| Shot | What was sent | OA ids | Result |
|---|---|---|---|
| S1 | One patient with every form field, plus `observations`/`diagnosis`. Then the same name again. | patients 44169, 44170 | Both 200 |
| S3 | Full NOA order in OA's own format: multipart `treatmentDTO`, alternative MX address, Morning Aligner flag | patient 44171, order **454012** | 200, `statusId` 1, `total` 607 |
| S4 | NOA order with MR −1 / MP 2, a 3 mm advance range | patient 44172, order **454013** | **200, accepted**, `total` 459 |

What we learned (each item becomes a rule or test in CORE-95):

1. **OA's server does not validate the device geometry.** An advance range of 3 mm (`invalidAdvancedLess5` in OA's form) was stored as sent. **Our validation is the only guard.** Every rule in §1–2 must therefore be enforced by our front end and by our API.
2. **OA's server does not enforce unique patient names.** A duplicate name was accepted, so the uniqueness check exists only in OA's form. We must check it ourselves before creating the OA patient, or reuse the existing link.
3. **The patient record keeps keys that OA's form never shows.** `observations` (free text) is stored. `diagnosis` is a list and silently ignored a string. `userId` comes back as a `user` object.
4. **The order DTO in OA's own format is stored field for field.** All of these came back exactly as sent:
   - `sequence` with `seq4` (the additional splint)
   - `teethStatus` (a JSON string)
   - `verticalDimension` 2000
   - band designs and finish
   - laterality and limit opening
   - deviation
   - `morningAligner`

   OA overrides `statusId` (sent 3, stored **1**), `requestDate`/`lastActivity` (server time) and `customerCountryId` (29). `workSheets` and `techObservations` are not echoed.
5. **OA upper-cases the delivery address** (`name`, `address`, `city`). The phone and email we sent are kept.
6. **Prices:** `total` is 459 for NOA and 607 for NOA with the Morning Aligner flag, so the flag adds 148.
7. **Response shape:** create returns the full treatment, with 91 top-level keys and `patient` as an object. `GET /api/treatments/DTO/:id` returns the same order.
8. **Initial status of a doctor order:** `statusId` 1. See §4.1 for the names.

Still open:
- Our app's own JSON/flat payload was never sent, because Łukasz chose a patient-only S1. CORE-95 replaces it with the OA-format adapter in any case.
- Status transitions get read from Monday 2026-10-06, on 454012 and 454013.
