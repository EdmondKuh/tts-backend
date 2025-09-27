import express from "express";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ⚙️ Variables d'env à définir avant de lancer :
const AZURE_KEY = process.env.AZURE_SPEECH_KEY;        // ex: "xxxxxxxxxxxxxxxx"
const AZURE_REGION = process.env.AZURE_SPEECH_REGION;  // ex: "westeurope" ou "francecentral"

const app = express();
const outDir = path.join(__dirname, "audio");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// Échappe le texte pour SSML
function esc(str="") {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

app.get("/tts", async (req, res) => {
  try {
    const text = (req.query.text || "").toString().trim();
    if (!text) return res.status(400).send("Missing text");

    // Options facultatives (query params) : ?rate=-12&pitch=-5&style=narration-drama
    const ratePct  = Number(req.query.rate ?? -12);      // en %, ex: -12
    const pitchSt  = Number(req.query.pitch ?? -5);      // en demi-tons, ex: -5st
    const style    = (req.query.style || "narration-drama").toString();

    // 💬 VOIX FIXÉE : fr-FR-HenriNeural
    const ssml = `
<speak version="1.0" xml:lang="fr-FR">
  <voice name="fr-FR-HenriNeural">
    <mstts:express-as style="${esc(style)}" xmlns:mstts="https://www.w3.org/2001/mstts">
      <prosody rate="${ratePct}%" pitch="${pitchSt}st">
        <break time="150ms"/>
        ${esc(text)}
        <break time="120ms"/>
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`.trim();

    // Récupération du token
    const tokenResp = await fetch(`https://${AZURE_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken`, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY }
    });
    if (!tokenResp.ok) return res.status(500).send("Azure token error");
    const token = await tokenResp.text();

    // Synthèse → MP3
    const ttsResp = await fetch(`https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-48khz-192kbitrate-mono-mp3",
        "User-Agent": "fivem-epic-tts"
      },
      body: ssml
    });
    if (!ttsResp.ok) return res.status(500).send(await ttsResp.text());

    const buf = Buffer.from(await ttsResp.arrayBuffer());
    const id = uuidv4();
    const file = path.join(outDir, `${id}.mp3`);
    fs.writeFileSync(file, buf);

    // Renvoie l'URL publique du MP3
    return res.status(200).send(`${req.protocol}://${req.get("host")}/audio/${id}.mp3`);
  } catch (e) {
    console.error(e);
    res.status(500).send("server error");
  }
});

app.use("/audio", express.static(outDir, { maxAge: "1m" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("TTS ready on port", PORT));
