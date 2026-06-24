import { Router } from "express";

import { analyzeReference, getReference } from "../controllers/reference.controller.js";

const router = Router();

router.post("/analyze", analyzeReference);
router.get("/:id", getReference);

export default router;
