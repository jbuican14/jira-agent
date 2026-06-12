import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { triageJiraRequirement } from "./src/utils/api";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post("/api/triage", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const emit = (type: string, payload: object) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    await triageJiraRequirement(prompt, emit);
  } catch (error) {
    emit("error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
