import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router = Router();

function getClient() {
  const key = process.env.AIGUYS_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

router.post("/api/suggest-correction", async (req, res) => {
  try {
    const { field, value, candidates } = req.body as {
      field: "manufacture" | "cellType" | "voltage";
      value: string;
      candidates: string[];
    };

    if (!value?.trim() || !Array.isArray(candidates) || candidates.length === 0) {
      return res.json({ suggestion: null });
    }

    const client = getClient();
    if (!client) {
      return res.json({ suggestion: null });
    }

    const fieldLabel =
      field === "manufacture"
        ? "battery manufacturer name"
        : field === "cellType"
        ? "industrial battery cell type or model number"
        : "battery voltage";

    const domainHint =
      field === "cellType"
        ? `\nFor cell types/models, common issues include:
- Missing spaces (e.g. "5PZS775" → "5 PzS 775")
- Case differences (PZS vs PzS vs pzs)
- Manufacturer prefix letters before the standard model (e.g. "5EPzS775" or "5IPzS775" both refer to "5 PzS 775" — strip the leading letter prefix)
- Abbreviated family names (e.g. "PZB" vs "PzB")`
        : field === "manufacture"
        ? `\nFor manufacturers, consider: case differences, abbreviations, partial names (e.g. "enersys" or "hawker" → "EnerSys / Hawker").`
        : `\nFor voltage, handle case and spacing (e.g. "48v" → "48V").`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `You are a battery data validation assistant for an industrial battery recycling company.
A depot operator typed a value for the ${fieldLabel} field.

Typed value: "${value}"

Valid options — choose ONLY from this exact list:
${candidates.map((c) => `- ${c}`).join("\n")}
${domainHint}

Find the single best match. If a close match exists, respond with ONLY that exact option text (copy it character-for-character from the list).
If no close match exists, respond with exactly: null`,
        },
      ],
    });

    const raw =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const suggestion = raw === "null" || !raw ? null : raw;

    // Only accept if it is verbatim in the candidates list
    const verified =
      suggestion && candidates.includes(suggestion) ? suggestion : null;

    return res.json({ suggestion: verified });
  } catch (err) {
    console.error("[suggest-correction] error:", err);
    return res.json({ suggestion: null });
  }
});

export default router;
