import express from "express";
import cors from "cors";

import referenceRoutes from "./routes/reference.routes.js";
import practiceRoutes from "./routes/practice.routes.js";
import reportRoutes from "./routes/report.routes.js";

const app = express();
const port = process.env.PORT || 8020;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "presentation-reference-practice-server" });
});

app.use("/api/references", referenceRoutes);
app.use("/api/practices", practiceRoutes);
app.use("/api/practices", reportRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Unexpected server error",
  });
});

app.listen(port, () => {
  console.log(`Presentation practice server listening on http://localhost:${port}`);
});

export default app;
