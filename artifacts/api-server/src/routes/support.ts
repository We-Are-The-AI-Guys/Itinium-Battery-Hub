import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

if (!process.env.AIGUYS_API_KEY) {
  console.warn("[support] AIGUYS_API_KEY is not set — support ticket submissions will return 503");
}
if (!process.env.CRM_PROJECT_ID) {
  console.warn("[support] CRM_PROJECT_ID is not set — support ticket submissions will return 503");
}

router.post("/support/ticket", requireAuth, async (req: AuthenticatedRequest, res) => {
  const apiKey = process.env.AIGUYS_API_KEY;
  const projectId = process.env.CRM_PROJECT_ID;

  const projectIdNum = Number(projectId);
  if (!apiKey || !projectId || !Number.isInteger(projectIdNum) || projectIdNum <= 0) {
    res.status(503).json({
      success: false,
      message: "Support ticket service not configured",
    });
    return;
  }

  const { title, details, priority } = req.body as {
    title?: string;
    details?: string;
    priority?: string;
  };

  if (!title || !title.trim()) {
    res.status(400).json({ success: false, message: "A title is required." });
    return;
  }

  const user = req.user!;
  const fullDetails = [
    details?.trim() || "",
    "",
    `Submitted by: ${user.fullName} (${user.email})`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();

  try {
    const crmRes = await fetch("https://aiguyscrm.replit.app/api/webhooks/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        projectId: projectIdNum,
        title: title.trim(),
        details: fullDetails,
        priority: priority || "P3",
      }),
    });

    const body = await crmRes.json().catch(() => ({}));

    if (!crmRes.ok) {
      console.error("[support] CRM responded with", crmRes.status, body);
      res.status(502).json({
        success: false,
        message: "The support service returned an error. Please try again later.",
      });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[support] Failed to reach CRM:", err);
    res.status(502).json({
      success: false,
      message: "Could not reach the support service. Please try again later.",
    });
  }
});

export default router;
