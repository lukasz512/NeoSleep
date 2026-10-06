import type { PoolClient } from "pg";
import type { TenantContext } from "../context/TenantContext.js";
import {
  getUserById,
  insertSignatureHandoff,
  getSignatureHandoffBySignHash,
  getSignatureHandoffByPickupHash,
  markSignatureHandoffSigned,
  markSignatureHandoffPickedUp,
  insertAuditLog,
  type SignatureHandoff,
  type SignatureHandoffLabel,
  type SignatureHandoffPurpose,
} from "../db.js";
import { ValidationError } from "../errors.js";
import { generateToken } from "../utils/generateToken.js";
import { hashToken } from "../utils/hashToken.js";
import { isSignatureDataUrl } from "../utils/signatureDataUrl.js";

/**
 * "Sign on your phone" (CORE-172): every signature pad on a computer shows a
 * QR next to it. Whoever owns the pad starts a handoff (partner = invite
 * token, patient = questionnaire token, doctor = session — see the callers)
 * and gets two secrets back:
 *   handoffToken  goes into the QR (/sign#<token>): it can read the label and
 *                 sign once, nothing else
 *   pickupToken   stays on the computer: it polls for the signature and gets
 *                 it exactly once
 * The signature lives in the row only between signing and pickup.
 */

export const SIGNATURE_HANDOFF_TTL_MS = 15 * 60 * 1000;

export interface StartedSignatureHandoff {
  handoffToken: string;
  pickupToken: string;
  expiresAt: string;
}

export interface SignatureHandoffPhoneView {
  status: "pending" | "signed";
  purpose: SignatureHandoffPurpose;
  signerName: string | null;
  versionLabel: string | null;
}

export type SignatureHandoffPickup = { status: "pending" } | { status: "expired" } | { status: "signed"; signatureDataUrl: string };

export interface SignatureHandoffRequestMeta {
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
}

function live(row: SignatureHandoff | null, now: Date): row is SignatureHandoff {
  return !!row && row.expires_at.getTime() > now.getTime() && !row.picked_up_at && !row.replaced_at;
}

/** Called by each owner once it has checked its own credential. A new QR retires the owner's earlier one. */
export async function StartSignatureHandoffCommand(
  client: PoolClient,
  input: { purpose: SignatureHandoffPurpose; ownerRef: string; label: SignatureHandoffLabel },
  now: Date = new Date()
): Promise<StartedSignatureHandoff> {
  const handoffToken = generateToken();
  const pickupToken = generateToken();
  const expiresAt = new Date(now.getTime() + SIGNATURE_HANDOFF_TTL_MS);
  await insertSignatureHandoff(client, {
    purpose: input.purpose,
    ownerRef: input.ownerRef,
    label: input.label,
    signTokenHash: hashToken(handoffToken),
    pickupTokenHash: hashToken(pickupToken),
    expiresAt,
  });
  return { handoffToken, pickupToken, expiresAt: expiresAt.toISOString() };
}

/** The QR next to the doctor's signature before printing the Historia clínica (NEO-255). Owned by the signed-in user. */
export async function StartDoctorSignHandoffCommand(ctx: TenantContext): Promise<StartedSignatureHandoff> {
  const user = await getUserById(ctx.client, ctx.user.id);
  return StartSignatureHandoffCommand(ctx.client, {
    purpose: "doctor_print",
    ownerRef: ctx.user.id,
    label: { signerName: user?.name ?? null },
  });
}

/** What the phone shows above the pad. Null = unknown, expired, replaced or already picked up. */
export async function GetSignatureHandoffForPhoneQuery(
  client: PoolClient,
  handoffToken: string,
  now: Date = new Date()
): Promise<SignatureHandoffPhoneView | null> {
  const token = handoffToken?.trim();
  if (!token) return null;
  const row = await getSignatureHandoffBySignHash(client, hashToken(token), { forUpdate: false });
  if (!live(row, now)) return null;
  return {
    status: row.signed_at ? "signed" : "pending",
    purpose: row.purpose,
    signerName: row.label.signerName ?? null,
    versionLabel: row.label.versionLabel ?? null,
  };
}

/** Stores the phone's signature, once per QR. False when the QR is unknown, expired, replaced or already signed. */
export async function SignSignatureHandoffCommand(
  client: PoolClient,
  input: { handoffToken: string; signatureDataUrl: string },
  meta: SignatureHandoffRequestMeta,
  now: Date = new Date()
): Promise<boolean> {
  const signature = input.signatureDataUrl;
  if (!isSignatureDataUrl(signature)) {
    throw new ValidationError("A handwritten signature is required", "signatureDataUrl");
  }
  const token = input.handoffToken?.trim();
  if (!token) return false;
  const row = await getSignatureHandoffBySignHash(client, hashToken(token), { forUpdate: true });
  if (!live(row, now) || row.signed_at) return false;
  await markSignatureHandoffSigned(client, row.id, { signature, ip: meta.ip, userAgent: meta.userAgent });
  await insertAuditLog(client, {
    action: "sign_on_phone",
    entity_type: "SignatureHandoff",
    entity_id: row.id,
    entity_after: { purpose: row.purpose, owner_ref: row.owner_ref },
    user_ip: meta.ip,
    user_agent: meta.userAgent,
    request_id: meta.requestId,
  });
  return true;
}

/** The computer's poll: the phone's signature, exactly once; then the QR is spent. */
export async function PickUpSignatureHandoffCommand(
  client: PoolClient,
  pickupToken: string,
  now: Date = new Date()
): Promise<SignatureHandoffPickup> {
  const token = pickupToken?.trim();
  if (!token) return { status: "expired" };
  const row = await getSignatureHandoffByPickupHash(client, hashToken(token));
  if (!live(row, now)) return { status: "expired" };
  if (!row.signature) return { status: "pending" };
  await markSignatureHandoffPickedUp(client, row.id);
  return { status: "signed", signatureDataUrl: row.signature };
}
