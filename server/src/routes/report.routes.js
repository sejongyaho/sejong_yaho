import { Router } from "express";

import { getPracticeReport } from "../controllers/report.controller.js";

const router = Router();

router.get("/:id/report", getPracticeReport);

export default router;
