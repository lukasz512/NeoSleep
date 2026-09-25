/**
 * neo/no-silent-catch (NEO-81) — an error may only be swallowed on purpose.
 *
 * Flags:
 *   - an empty `catch {}` block, and
 *   - an empty `.catch(() => {})` / `.catch(() => undefined)` callback,
 * unless a `// benign: <reason>` comment sits inside it or directly above the
 * statement. Everything else should call reportCaught(err, { where }) from
 * @neo/api-client (console + POST /api/v1/diagnostics) — see
 * docs/stories/error-handling-pattern.md.
 *
 * ESLint's own `no-empty` can't express this: it treats any comment as
 * "not empty", so `catch { // ignore }` would still pass.
 */
const BENIGN = /\bbenign:/;

function isEmptyCallbackBody(fn) {
  const body = fn.body;
  if (body.type === "BlockStatement") return body.body.length === 0;
  if (body.type === "Identifier" && body.name === "undefined") return true;
  if (body.type === "UnaryExpression" && body.operator === "void") return true;
  return body.type === "Literal" && body.value === null;
}

function enclosingStatement(node) {
  let current = node;
  while (current.parent && !/(Statement|Declaration)$/.test(current.type)) current = current.parent;
  return current;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow empty catch blocks / .catch callbacks unless marked `// benign: <reason>`",
    },
    schema: [],
    messages: {
      emptyCatch:
        "Empty catch block swallows the error. Call reportCaught(err, { where }) from @api, or add `// benign: <reason>` if ignoring it is intended.",
      emptyCatchCallback:
        "Empty .catch() callback swallows the error. Call reportCaught(err, { where }) from @api, or add `// benign: <reason>` if ignoring it is intended.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function isMarkedBenign(node) {
      if (sourceCode.getCommentsInside(node).some((c) => BENIGN.test(c.value))) return true;
      return sourceCode.getCommentsBefore(enclosingStatement(node)).some((c) => BENIGN.test(c.value));
    }

    return {
      CatchClause(node) {
        if (node.body.body.length === 0 && !isMarkedBenign(node.body)) {
          context.report({ node, messageId: "emptyCatch" });
        }
      },
      "CallExpression[callee.type='MemberExpression'][callee.property.name='catch']"(node) {
        const fn = node.arguments[0];
        if (!fn || (fn.type !== "ArrowFunctionExpression" && fn.type !== "FunctionExpression")) return;
        if (!isEmptyCallbackBody(fn) || isMarkedBenign(node)) return;
        context.report({ node: fn, messageId: "emptyCatchCallback" });
      },
    };
  },
};

export default {
  meta: { name: "neo" },
  rules: { "no-silent-catch": rule },
};
