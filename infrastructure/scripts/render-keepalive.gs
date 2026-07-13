// Google Apps Script — keep the Render free-tier BFF (PROD) from spinning down.
//
// Render free web services spin down after 15 min with no inbound traffic and
// take ~1 min to wake on the next request. This ping resets that timer before
// it fires, so PROD effectively never sleeps.
//
// Only PROD is pinged: Render's free tier grants 750 instance-hours per
// WORKSPACE per month (shared across all free services in it). One service
// pinged 24/7 already uses ~730-744 of those hours — keeping both prod and
// uat always-warm would exceed the shared budget. UAT is left to sleep
// naturally; wake it manually (open the URL once) before a testing session.
//
// Setup:
//   1. script.google.com -> New project -> paste this in
//   2. Replace PING_URL below with the PROD health check URL
//   3. Triggers (clock icon, left sidebar) -> Add trigger
//        - Function: pingBff
//        - Event source: Time-driven
//        - Type: Minutes timer -> Every 10 minutes
//   4. Save, authorize when prompted

const PING_URL = "https://api.neosleepcare.com/health"; // PROD only

function pingBff() {
  const response = UrlFetchApp.fetch(PING_URL, { muteHttpExceptions: true });
  Logger.log("BFF keep-alive ping: %s", response.getResponseCode());
}
