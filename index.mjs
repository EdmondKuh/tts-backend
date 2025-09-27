import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_KEY = process.env.GOOGLE_TTS_KEY;

const app = express();
const outDir = path.join(__dirname, "audio");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

app.get("/tts", async (req, res) => {
  try {
    const text = (req.query.text || "").toString().trim();
    if (!text) return res.status(400).send("Missing text");

    const voice = "fr-FR-Wavenet-D"; // Voix masculine grave
    const payload = {
      input: { text },
      voice: { languageCode: "fr-FR", name: voice },
      audioConfig: { audioEncoding: "MP3", pitch: -2, speakingRate: 0.9 }
    };

    const resp = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      return res.status(500).send(await resp.text());
    }

    const data = await resp.json();
    const buf = Buffer.from(data.audioContent, "base64");

    const id = uuidv4();
    fs.writeFileSync(path.join(outDir, `${id}.mp3`), buf);

    res.status(200).send(`${req.protocol}://${req.get("host")}/audio/${id}.mp3`);
  } catch (e) {
    console.error(e);
    res.status(500).send("server error");
  }
});

app.use("/audio", express.static(path.join(__dirname, "audio"), { maxAge: "1m" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("TTS Google Cloud ready on port", PORT));

