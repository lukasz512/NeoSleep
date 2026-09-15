import { Router, type Router as RouterType, type Request, type Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireInternalJobSecret } from "../middleware/requireInternalJobSecret.js";
import { renderHtmlToPdf } from "../services/documentRenderer.js";

/**
 * TEMPORARY diagnostic route — not the PDF generator itself (that's
 * services/documentRenderer.ts, the one shared renderHtmlToPdf() every
 * document type calls). This route only checks whether headless Chrome
 * runs reliably on Render's free-tier single-process service, before the
 * real document-generation pipeline is built on top of that assumption
 * (see docs/stories/partner-registration-legal-documents.md, sequencing
 * step 1).
 *
 * Hit this a few times against the dev deploy and watch Render's dashboard
 * memory graph, not just this endpoint's own numbers — the first call pays
 * Chromium's cold-launch cost (renderMs will be much higher than later
 * calls, which reuse the warm browser instance).
 *
 * Delete this file + its registration in server.ts once memory/stability is
 * confirmed — it is not part of the permanent API surface.
 */
export const internalPdfRenderCheckRouter: RouterType = Router();

internalPdfRenderCheckRouter.get(
  "/internal/pdf-render-check",
  requireInternalJobSecret,
  asyncHandler(async (_req: Request, res: Response) => {
    const before = process.memoryUsage();
    const startedAt = Date.now();
    const pdf = await renderHtmlToPdf(
      `<!doctype html><html><head><meta charset="utf-8"><style>
        body { font-family: sans-serif; padding: 40px; }
        h1 { color: #409183; }
      </style></head><body>
        <h1>NeoSleep PDF render check</h1>
        <p>Generated at ${new Date().toISOString()}</p>
      </body></html>`
    );
    const renderMs = Date.now() - startedAt;
    const after = process.memoryUsage();
    const result = {
      ok: true,
      renderMs,
      pdfBytes: pdf.length,
      memoryUsageMb: { before: mbOf(before), after: mbOf(after) },
    };
    console.log("[pdf-render-check]", JSON.stringify(result));
    res.json(result);
  })
);

function mbOf(m: NodeJS.MemoryUsage): Record<string, number> {
  return {
    rss: Math.round(m.rss / 1024 / 1024),
    heapUsed: Math.round(m.heapUsed / 1024 / 1024),
    heapTotal: Math.round(m.heapTotal / 1024 / 1024),
    external: Math.round(m.external / 1024 / 1024),
  };
}
