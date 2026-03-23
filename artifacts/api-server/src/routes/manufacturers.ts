import { Router } from "express";

const router = Router();

const MANUFACTURERS = [
  "EnerSys Hawker",
  "Espex",
  "Eternity",
  "Exide / GNB",
  "Hawker",
  "Velaris / Ecobat / EDrive",
  "Hoppecke",
  "Juice",
  "Midac",
  "TAB",
  "Triathlon / Sunlight",
  "Other",
];

router.get("/manufacturers", (_req, res) => {
  res.json({ manufacturers: MANUFACTURERS });
});

export default router;
