import { Router, type Router as RouterType } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { aiChatLimiter } from "../middleware/rateLimiter.js";
import { insertAuditLog, tenantSlugFromHost, withTenant } from "../db.js";
import { ValidationError } from "../errors.js";
import { loadKnowledge } from "../ai/knowledge.js";
import { askModel, AiUnavailableError } from "../ai/provider.js";

/**
 * NeoSleep AI stage 1 (CORE-274): admin-only, knowledge-only Q&A. No tools, no DB data
 * reaches the model. Every call is audited; the question text is NOT stored (length only).
 */

export const MAX_QUESTION_CHARS = 500;

export const aiRouter: RouterType = Router();

aiRouter.post(
  "/ai/chat",
  requireAuth,
  requireRole("admin"),
  aiChatLimiter,
  asyncHandler(async (req, res) => {
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    if (!question) throw new ValidationError("question is required");
    if (question.length > MAX_QUESTION_CHARS) {
      throw new ValidationError(`question must be at most ${MAX_QUESTION_CHARS} characters`);
    }

    const slug = tenantSlugFromHost(req.hostname);
    const userId = req.user!.sub;
    const audit = (outcome: string, metadata: Record<string, unknown>) =>
      withTenant(slug, (client) =>
        insertAuditLog(client, {
          user_id: userId,
          action: "ai_chat",
          entity_type: "AiChat",
          outcome,
          metadata: { question_chars: question.length, ...metadata },
          user_ip: req.ip,
          user_agent: req.get("user-agent") ?? null,
        })
      );

    try {
      const result = await askModel(question, loadKnowledge());
      await audit("success", {
        model: result.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
      });
      res.json({ answer: result.answer });
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        await audit("serious_failure", { reason: err.message });
        res.status(503).json({ error: "NeoSleep AI is temporarily unavailable" });
        return;
      }
      throw err;
    }
  })
);
