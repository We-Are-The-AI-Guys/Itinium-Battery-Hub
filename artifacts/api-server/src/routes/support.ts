import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router = Router();

if (!process.env.AIGUYS_API_KEY) {
  console.warn("[support] AIGUYS_API_KEY is not set — support ticket submissions will return 503");
}
if (!process.env.CRM_PROJECT_ID) {
  console.warn("[support] CRM_PROJECT_ID is not set — support ticket submissions will return 503");
}

const SCREENSHOT_DIR_CANDIDATES = [
  path.resolve(process.cwd(), "attached_assets", "support-screenshots"),
  path.resolve(process.cwd(), "../../attached_assets", "support-screenshots"),
];
const SCREENSHOT_DIR =
  SCREENSHOT_DIR_CANDIDATES.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) ?? SCREENSHOT_DIR_CANDIDATES[0];

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SCREENSHOT_DIR),
    filename: (_req, _file, cb) => {
      const ext = path.extname(_file.originalname).toLowerCase() || ".png";
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function buildPublicBase(req: AuthenticatedRequest): string {
  const domain =
    process.env.REPLIT_DOMAINS?.split(",")[0] ||
    process.env.REPLIT_DEV_DOMAIN ||
    req.get("host") ||
    "localhost";
  return `https://${domain}`;
}

router.post(
  "/support/screenshot",
  requireAuth,
  upload.single("screenshot"),
  (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, message: "No image file provided." });
      return;
    }
    const base = buildPublicBase(req);
    const screenshotUrl = `${base}/api/support/screenshot/${req.file.filename}`;
    res.json({ success: true, screenshotUrl });
  }
);

router.get("/support/screenshot/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(SCREENSHOT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: "Screenshot not found" });
    return;
  }
  res.sendFile(filePath);
});

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

  const { title, details, priority, screenshotUrl } = req.body as {
    title?: string;
    details?: string;
    priority?: string;
    screenshotUrl?: string;
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
    const payload: Record<string, unknown> = {
      projectId: projectIdNum,
      title: title.trim(),
      details: fullDetails,
      priority: priority || "P3",
    };
    if (screenshotUrl) payload.screenshotUrl = screenshotUrl;

    const crmRes = await fetch("https://aiguyscrm.replit.app/api/webhooks/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const contentType = crmRes.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await crmRes.json().catch(() => ({})) : {};

    if (!crmRes.ok) {
      const crmDown = !isJson || crmRes.status === 404;
      console.error("[support] CRM responded with", crmRes.status, body);
      res.status(502).json({
        success: false,
        message: crmDown
          ? "The support system is temporarily unavailable. Please email support@itinium.co.uk directly."
          : "The support service returned an error. Please try again later.",
      });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[support] Failed to reach CRM:", err);
    res.status(502).json({
      success: false,
      message:
        "Could not reach the support service. Please email support@itinium.co.uk directly.",
    });
  }
});

export default router;
