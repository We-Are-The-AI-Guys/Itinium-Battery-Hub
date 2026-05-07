import { Router } from "express";

const router = Router();

export const MANUFACTURERS = [
  "EnerSys / Hawker",
  "Espex",
  "Eternity / Juice",
  "Exide / GNB",
  "Hoppecke",
  "Midac",
  "TAB",
  "Triathlon / Sunlight",
  "Velaris / Ecobat / EDrive",
  "Other",
];

export const MANUFACTURER_ALIASES: Record<string, string> = {
  CEIL: "Espex",
};

router.get("/manufacturers", (_req, res) => {
  res.json({ manufacturers: MANUFACTURERS, aliases: MANUFACTURER_ALIASES });
});

export default router;
