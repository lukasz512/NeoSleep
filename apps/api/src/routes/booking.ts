import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { bookingLimiter } from "../middleware/rateLimiter.js";
import { getSlots, bookSlot } from "../services/googleCalendar.js";
import { withTenant, tenantSlugFromHost } from "../db.js";
import { UpsertPublicLeadCommand } from "../commands/lead.js";
import { sendContactEmail, sendDemoBookingConfirmationEmail, localeForRegion } from "../mailer.js";
import { ValidationError } from "../errors.js";
import type { RequestWithId } from "../middleware/requestId.js";

/** Public, unauthenticated — powers the booking widget on neosleepcare.com/for-professionals. */
export const bookingRouter: import("express").Router = Router();

bookingRouter.get(
  "/booking/slots",
  bookingLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const daysParam = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : undefined;
    // 45 business days covers the ~2-month booking horizon enforced in googleCalendar.ts.
    const days = Number.isFinite(daysParam) && daysParam! > 0 && daysParam! <= 45 ? daysParam : undefined;
    const slots = await getSlots({ days });
    res.json({ slots });
  })
);

bookingRouter.post(
  "/booking/book",
  bookingLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      start?: string;
      end?: string;
      leadId?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      institution?: string;
      city?: string;
      countryCode?: string;
    };
    if (typeof body.start !== "string" || typeof body.end !== "string") {
      throw new ValidationError("start and end are required");
    }

    const firstName = typeof body.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const institution = typeof body.institution === "string" ? body.institution.trim() : "";
    const fullName = `${firstName} ${lastName}`.trim();

    const booked = await bookSlot({ start: body.start, end: body.end, name: fullName, email });

    // Lead capture + confirmation emails are secondary to the calendar event
    // that already succeeded above — log and move on, never fail the
    // response over them (the meeting is real either way).
    try {
      const slug = tenantSlugFromHost(req.hostname);
      const requestId = (req as RequestWithId).requestId;
      const lead = await withTenant(slug, (client) =>
        UpsertPublicLeadCommand(
          client,
          {
            leadId: body.leadId,
            first_name: firstName,
            last_name: lastName,
            email,
            phone: body.phone,
            institution,
            city: body.city,
            country_code: body.countryCode,
          },
          { requestId }
        )
      );

      const meetingTimeCET = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Warsaw",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(body.start));

      await sendContactEmail(`New demo booking — ${fullName || email}`, [
        ["Name", fullName || "—"],
        ["Clinic", institution || "—"],
        ["Phone", body.phone || "—"],
        ["Email", email || "—"],
        ["City", body.city || "—"],
        ["Country", body.countryCode || "—"],
        ["Meeting time (CET)", meetingTimeCET],
        ["Lead", lead.id],
      ]);

      await sendDemoBookingConfirmationEmail(
        email,
        { start: body.start, meetLink: booked.meetLink },
        { firstName, lastName, language: localeForRegion(body.countryCode), region: body.countryCode }
      );
    } catch (err) {
      console.error("[booking] lead capture / confirmation email failed (booking itself still succeeded):", err);
    }

    res.status(201).json(booked);
  })
);
