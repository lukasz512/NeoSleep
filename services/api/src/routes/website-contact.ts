import { Router, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { sendContactEmail } from "../mailer.js";
import { contactFormLimiter } from "../middleware/rateLimiter.js";

export const websiteContactRouter = Router();

websiteContactRouter.post(
  "/api/contact",
  contactFormLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    console.log("[contact] POST /api/contact body:", JSON.stringify(req.body));
    const body = req.body as {
      type?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      email?: string;
      city?: string;
      message?: string;
      notes?: string;
      companyName?: string;
      taxNumber?: string;
    };

    const type = body.type === "client" ? "client" : "patient";
    const firstName = (typeof body.firstName === "string" ? body.firstName : "").trim();
    const lastName = (typeof body.lastName === "string" ? body.lastName : "").trim();
    const phone = (typeof body.phone === "string" ? body.phone : "").trim();
    const city = (typeof body.city === "string" ? body.city : "").trim();

    console.log("[contact] parsed:", { type, firstName, lastName, phone, city });

    if (!firstName || !lastName || !phone || !city) {
      console.log("[contact] 400 missing base fields");
      res.status(400).json({ error: "Missing required fields: firstName, lastName, phone, city" });
      return;
    }

    if (type === "patient") {
      const email = (typeof body.email === "string" ? body.email : "").trim();
      const message = (typeof body.message === "string" ? body.message : "").trim();
      if (!email || !message) {
        res.status(400).json({ error: "Missing required fields: email, message" });
        return;
      }
      const rows: [string, string][] = [
        ["Imię i nazwisko", `${firstName} ${lastName}`],
        ["Telefon", phone],
        ["Email", email],
        ["Miasto", city],
        ["Wiadomość", message],
      ];
      if (body.notes?.trim()) rows.push(["Dodatkowe info", body.notes.trim()]);
      console.log("[contact] calling sendContactEmail (patient)");
      await sendContactEmail(`Zapytanie od pacjenta – ${firstName} ${lastName}`, rows);
      console.log("[contact] sendContactEmail done");
    } else {
      const companyName = (typeof body.companyName === "string" ? body.companyName : "").trim();
      const taxNumber = (typeof body.taxNumber === "string" ? body.taxNumber : "").trim();
      if (!companyName || !taxNumber) {
        res.status(400).json({ error: "Missing required fields: companyName, taxNumber" });
        return;
      }
      const rows: [string, string][] = [
        ["Imię i nazwisko", `${firstName} ${lastName}`],
        ["Telefon", phone],
        ["Firma", companyName],
        ["NIP", taxNumber],
        ["Miasto", city],
      ];
      console.log("[contact] calling sendContactEmail (client)");
      await sendContactEmail(`Zapytanie od klienta – ${firstName} ${lastName} (${companyName})`, rows);
      console.log("[contact] sendContactEmail done");
    }

    console.log("[contact] responding 200 ok");
    res.json({ ok: true });
  })
);
