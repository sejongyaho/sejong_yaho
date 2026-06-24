import { Router } from "express";

import { analyzePractice } from "../controllers/practice.controller.js";

const router = Router();

router.post("/analyze", analyzePractice);

export default router;
