/**
 * NEO-51 — configures one jurisdiction's NeoSleep signatory for the partner
 * onboarding documents: uploads the signature PNG to the PRIVATE documents
 * bucket and stores { printedName, signaturePath, approverUserId, ccEmail }
 * in the tenant's app_config.metadata.partnerSignatories.signatories.<PL|MX>.
 *
 * The PNG lives outside the repo (gitignored secrets/signatures/) and is
 * never committed or served publicly — after this runs, it only exists in
 * the private bucket and only leaves the server embedded in a token-gated
 * preview or a generated PDF.
 *
 * The approver must already have a user account in the tenant (admin or
 * manager, so they can reach the Documents tab); after this runs they approve
 * the current partnerAgreement + partnerDpa versions there, which is what
 * authorises their signature on that text.
 *
 * Run (from apps/api), once per jurisdiction:
 *   npx tsx --env-file=../../.env scripts/setupPartnerSignatories.ts \
 *     --tenant neosleep --jurisdiction PL \
 *     --name "Łukasz Ostrowski / NeoSleep" \
 *     --png ../../secrets/signatures/counterparty-lukasz-janusz-ostrowski.png \
 *     --approver-email lukasz.ostrowski@neosleepcare.com \
 *     --cc lukasz.ostrowski@neosleepcare.com
 */
import fs from "node:fs";
import { withTenant } from "../src/db/tenant.js";
import { getUserIdByEmail } from "../src/db/users.js";
import { setPartnerSignatory, type PartnerJurisdiction } from "../src/db/partnerSignatories.js";
import { uploadPartnerDocument } from "../src/services/partnerDocuments.js";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) {
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return value;
}

const tenant = arg("tenant");
const jurisdictionArg = arg("jurisdiction").toUpperCase();
if (jurisdictionArg !== "PL" && jurisdictionArg !== "MX") {
  console.error("--jurisdiction must be PL or MX");
  process.exit(1);
}
const jurisdiction: PartnerJurisdiction = jurisdictionArg;
const printedName = arg("name");
const pngPath = arg("png");
const approverEmail = arg("approver-email").trim().toLowerCase();
const ccEmail = arg("cc").trim();

const bytes = fs.readFileSync(pngPath);
// PNG magic number — refuse anything that isn't one, the renderer only embeds PNG data URLs.
if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  console.error(`${pngPath} is not a PNG file`);
  process.exit(1);
}

const signaturePath = `signatures/${tenant}/${jurisdiction}-${Date.now()}.png`;
await uploadPartnerDocument(signaturePath, new Uint8Array(bytes), "image/png");

await withTenant(tenant, async (client) => {
  const approverUserId = await getUserIdByEmail(client, approverEmail);
  if (!approverUserId) throw new Error(`No user with email ${approverEmail} in tenant ${tenant}`);
  await setPartnerSignatory(client, jurisdiction, { printedName, signaturePath, approverUserId, ccEmail });
  console.log(`configured ${jurisdiction} signatory "${printedName}" (approver ${approverEmail}, cc ${ccEmail}), signature at ${signaturePath}`);
});

process.exit(0);
