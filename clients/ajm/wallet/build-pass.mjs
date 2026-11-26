#!/usr/bin/env node
/**
 * Apple Wallet business card for AJ Management (CORE-47, Łukasz 2026-09-29): Alfred's details, the
 * client's logo and a QR that opens alfredjan.com/corporativo with the QR entry (?src=qr).
 *
 *   node clients/ajm/wallet/build-pass.mjs
 *
 * Always writes, under clients/ajm/wallet/out/:
 *   pass/                 the pass bundle (pass.json, icon*, logo*, manifest.json)
 *   ajm-card-unsigned.zip that bundle zipped: for a pass-signing service, or to sign later
 *   qr.png, logo.png      the QR and the logo on their own, for services that build the pass for you
 *   preview.png           what the card looks like
 * and, when a Pass Type ID certificate is given, the signed card ajm-card.pkpass:
 *
 *   PASS_TYPE_ID=pass.com.alfredjan.card TEAM_ID=ABCDE12345 \
 *   PASS_CERT=/path/pass.p12 PASS_CERT_PASSWORD=… WWDR_CERT=/path/AppleWWDRCAG4.cer \
 *     node clients/ajm/wallet/build-pass.mjs
 *
 * Apple only installs signed passes; the certificate comes from an Apple Developer account
 * (Certificates, Identifiers & Profiles → Pass Type IDs). Nothing secret is stored in the repo.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.join(HERE, "out");
const BUNDLE = path.join(OUT, "pass");
const URL_QR = "https://alfredjan.com/corporativo/?src=qr";

// Brand colours from "logo alfred fondo blanco.ai": dark words and A, light grey J and "Management".
const DARK = "#333333";
const GREY = "#a6a6a6";
const PAPER = "#f4f1ea";

// The logo's paths (same file the site uses), split into the dark and grey parts.
const logoSrc = fs.readFileSync(path.join(ROOT, "clients/ajm/corporativo/src/components/AjLogo.vue"), "utf8");
const paths = [...logoSrc.matchAll(/<path d="([^"]+)" transform="([^"]+)" \/>/g)].map(([, d, t]) => {
  const [, , , , x, y] = t.slice(t.indexOf("(") + 1, -1).split(",").map(Number);
  return { d, t, x, y };
});
const isJ = (p) => Math.abs(p.x - 894.547) < 0.1;
const isA = (p) => Math.abs(p.x - 803.619) < 0.1;
const isWord = (p) => p.y > 460;
const svgPath = (p, fill) => `<path d="${p.d}" transform="${p.t}" fill="${fill}"/>`;
const lockupSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 200 1170 330">${paths
  .map((p) => svgPath(p, isJ(p) || isWord(p) ? GREY : DARK))
  .join("")}</svg>`;
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="600 190 320 320">${paths
  .filter((p) => isA(p) || isJ(p))
  .map((p) => svgPath(p, isJ(p) ? GREY : DARK))
  .join("")}</svg>`;

const pass = {
  formatVersion: 1,
  passTypeIdentifier: process.env.PASS_TYPE_ID ?? "pass.com.alfredjan.card",
  teamIdentifier: process.env.TEAM_ID ?? "TEAMID0000",
  serialNumber: "ajm-alfred-jan-diaz-001",
  organizationName: "AJ Management",
  description: "Alfred Jan Díaz · AJ Management",
  backgroundColor: "rgb(244, 241, 234)",
  foregroundColor: "rgb(29, 28, 26)",
  labelColor: "rgb(124, 119, 109)",
  sharingProhibited: false,
  generic: {
    primaryFields: [{ key: "name", label: "FOUNDER & DIRECTOR", value: "Alfred Jan Díaz" }],
    secondaryFields: [
      { key: "email", label: "EMAIL", value: "aj@alfredjan.com" },
      { key: "whatsapp", label: "WHATSAPP", value: "+52 55 1745 8958" },
    ],
    auxiliaryFields: [{ key: "places", label: "BASED IN", value: "Ciudad de México · Madrid" }],
    backFields: [
      { key: "web", label: "Portfolio", value: "https://alfredjan.com/corporativo" },
      { key: "mail", label: "Email", value: "aj@alfredjan.com" },
      { key: "phone", label: "WhatsApp", value: "+52 55 1745 8958" },
      { key: "instagram", label: "Instagram", value: "https://instagram.com/alfredjan" },
      { key: "linkedin", label: "LinkedIn", value: "https://www.linkedin.com/in/alfredjan/" },
      { key: "about", label: "AJ Management", value: "Corporate events · Experiences · Production" },
    ],
  },
  barcodes: [{ format: "PKBarcodeFormatQR", message: URL_QR, messageEncoding: "iso-8859-1", altText: "alfredjan.com/corporativo" }],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(BUNDLE, { recursive: true });
fs.writeFileSync(path.join(BUNDLE, "pass.json"), JSON.stringify(pass, null, 2));

// Images, rendered by the browser the repo already uses for screenshots.
const { chromium } = createRequire(path.join(ROOT, "apps/pwa/package.json"))("@playwright/test");
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, w, h, file, { background = "transparent", pad = 0 } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><body style="margin:0;background:${background};display:grid;place-items:center;width:${w}px;height:${h}px">` +
      `<div style="width:${w - 2 * pad}px;height:${h - 2 * pad}px">${svg.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: background === "transparent" });
}
// icon: the AJ mark on paper (shown in notifications and Mail); logo: the full lockup, top-left of the card
for (const [scale, suffix] of [[1, ""], [2, "@2x"], [3, "@3x"]]) {
  await png(markSvg, 29 * scale, 29 * scale, path.join(BUNDLE, `icon${suffix}.png`), { background: PAPER, pad: 3 * scale });
  await png(lockupSvg, 160 * scale, 50 * scale, path.join(BUNDLE, `logo${suffix}.png`));
}
await png(lockupSvg, 1200, 340, path.join(OUT, "logo.png"));

// The QR on its own (for services that build the pass themselves); qrcode comes from apps/pwa.
const qrcode = createRequire(path.join(ROOT, "apps/pwa/package.json"))("qrcode");
await qrcode.toFile(path.join(OUT, "qr.png"), URL_QR, { width: 1000, margin: 2, color: { dark: "#1d1c1a", light: "#ffffff" } });

// A preview of the card, laid out like Wallet's generic pass.
const qrSvg = await qrcode.toString(URL_QR, { type: "svg", margin: 1, color: { dark: "#1d1c1a", light: "#ffffff" } });
await page.setViewportSize({ width: 420, height: 640 });
await page.setContent(`<html><body style="margin:0;background:#d9d6cf;font-family:-apple-system,Helvetica,sans-serif">
<div style="margin:20px;background:${PAPER};border-radius:14px;padding:16px 18px;height:560px;box-sizing:border-box;position:relative;color:#1d1c1a">
  <div style="height:36px;width:118px">${lockupSvg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
  <div style="margin-top:34px;font-size:11px;letter-spacing:.06em;color:#7c776d">FOUNDER &amp; DIRECTOR</div>
  <div style="font-size:26px;margin-top:2px">Alfred Jan Díaz</div>
  <div style="display:flex;gap:30px;margin-top:22px">
    <div><div style="font-size:11px;letter-spacing:.06em;color:#7c776d">EMAIL</div><div style="font-size:15px">aj@alfredjan.com</div></div>
    <div><div style="font-size:11px;letter-spacing:.06em;color:#7c776d">WHATSAPP</div><div style="font-size:15px">+52 55 1745 8958</div></div>
  </div>
  <div style="margin-top:16px"><div style="font-size:11px;letter-spacing:.06em;color:#7c776d">BASED IN</div><div style="font-size:15px">Ciudad de México · Madrid</div></div>
  <div style="position:absolute;left:0;right:0;bottom:22px;display:grid;justify-items:center;gap:6px">
    <div style="background:#fff;padding:8px;border-radius:6px;width:150px;height:150px">${qrSvg.replace("<svg ", '<svg width="100%" height="100%" ')}</div>
    <div style="font-size:11px;color:#1d1c1a">alfredjan.com/corporativo</div>
  </div>
</div></body></html>`);
await page.screenshot({ path: path.join(OUT, "preview.png") });
await browser.close();

// manifest.json: SHA-1 of every file in the bundle
const manifest = {};
for (const f of fs.readdirSync(BUNDLE)) manifest[f] = createHash("sha1").update(fs.readFileSync(path.join(BUNDLE, f))).digest("hex");
fs.writeFileSync(path.join(BUNDLE, "manifest.json"), JSON.stringify(manifest, null, 2));

const zip = (dest) => execFileSync("zip", ["-qr", dest, "."], { cwd: BUNDLE });
zip(path.join(OUT, "ajm-card-unsigned.zip"));

// Signed .pkpass, only when a certificate is supplied (kept outside the repo; never logged)
const { PASS_CERT, PASS_CERT_PASSWORD = "", WWDR_CERT } = process.env;
if (PASS_CERT && WWDR_CERT && process.env.PASS_TYPE_ID && process.env.TEAM_ID) {
  const tmp = fs.mkdtempSync(path.join(OUT, "sign-"));
  const pem = (args, file) => execFileSync("openssl", [...args, "-out", path.join(tmp, file)], { stdio: ["ignore", "ignore", "inherit"] });
  const pw = ["-passin", `env:PASS_CERT_PASSWORD`];
  pem(["pkcs12", "-in", PASS_CERT, "-clcerts", "-nokeys", "-legacy", ...pw], "cert.pem");
  pem(["pkcs12", "-in", PASS_CERT, "-nocerts", "-nodes", "-legacy", ...pw], "key.pem");
  pem(["x509", "-inform", "DER", "-in", WWDR_CERT], "wwdr.pem");
  execFileSync("openssl", [
    "smime", "-binary", "-sign", "-certfile", path.join(tmp, "wwdr.pem"), "-signer", path.join(tmp, "cert.pem"),
    "-inkey", path.join(tmp, "key.pem"), "-in", path.join(BUNDLE, "manifest.json"), "-out", path.join(BUNDLE, "signature"), "-outform", "DER",
  ], { env: { ...process.env, PASS_CERT_PASSWORD } });
  fs.rmSync(tmp, { recursive: true, force: true });
  zip(path.join(OUT, "ajm-card.pkpass"));
  console.log("signed: out/ajm-card.pkpass");
} else {
  console.log("unsigned bundle: out/ajm-card-unsigned.zip (set PASS_TYPE_ID, TEAM_ID, PASS_CERT, WWDR_CERT to sign)");
}
