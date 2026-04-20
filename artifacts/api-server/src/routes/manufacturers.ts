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

router.get("/manufacturers", (_req, res) => {
  res.json({ manufacturers: MANUFACTURERS });
});

export default router;
