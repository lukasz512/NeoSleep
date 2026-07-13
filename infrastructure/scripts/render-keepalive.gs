// Google Apps Script — keep the Render free-tier BFF from spinning down.
//
// Render free web services spin down after 15 min with no inbound traffic and
// take ~1 min to wake on the next request. This ping resets that timer before
// it fires, so the service effectively never sleeps.
//
// Single service only (render.yaml defines one: "neosleep-bff", tracks branch
// `prod`). Render's free tier grants 750 instance-hours/month per workspace —
// pinging this one service 24/7 uses ~730-744 of those hours, which fits.
// Dev work happens locally or on the `dev` branch and never deploys, so there
// is nothing else competing for the budget.
//
// Setup:
//   1. script.google.com -> New project -> paste this in
//   2. Replace PING_URL below with this service's health check URL
//   3. Triggers (clock icon, left sidebar) -> Add trigger
//        - Function: pingBff
//        - Event source: Time-driven
//        - Type: Minutes timer -> Every 10 minutes
//   4. Save, authorize when prompted

const PING_URL = "https://api.neosleepcare.com/health";

function pingBff() {
  const response = UrlFetchApp.fetch(PING_URL, { muteHttpExceptions: true });
  Logger.log("BFF keep-alive ping: %s", response.getResponseCode());
}
