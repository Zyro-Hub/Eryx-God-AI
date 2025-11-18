// =============================================================
// JARVIS v15.0 PRO - BEST WhatsApp AI Bot by Prashant Pandey
// Groups + Private Chat + Images + Memes + Jokes + Memory
// Gemini 2.0 Flash
//
// Install:
// npm i whatsapp-web.js qrcode-terminal axios fs-extra p-retry p-limit
// =============================================================

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const pRetry = require("p-retry").default;
const pLimit = require("p-limit").default;
const fs = require("fs-extra");
const path = require("path");
const {
    MEMORY,
    updateUserMemory,
    updateGroupMemory
} = require("./memory_manage");

// ---------------- CONFIG ----------------
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_KEY = "AIzaSyA3Ks92dFRl40KElGelq87dztxNngFAopw";
const HISTORY_FILE = path.resolve(__dirname, "jarvis_memory.json");

const AI_CALL_TIMEOUT = 14_000;
const SAVE_INTERVAL = 10_000;
const OUTGOING_DELAY = 800;
const TYPING_MIN_MS = 300;
const MAX_IMAGE_PROMPTS = 5;

const BOT_NAME = "eryx";      
const PREFIX = "!eryx";          

const IMAGE_PROVIDER = "pollinations";

// -------------- MEMORY ------------------
let chatHistory = {};
if (fs.existsSync(HISTORY_FILE)) {
    try {
        chatHistory = fs.readJsonSync(HISTORY_FILE);
    } catch {
        chatHistory = {};
    }
}
setInterval(() => {
    fs.writeJsonSync(HISTORY_FILE, chatHistory, { spaces: 2 });
}, SAVE_INTERVAL);

// Throttle outgoing messages
const sendLimit = pLimit(1);
function pause(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// ---------------- AI BRAIN ----------------
const JARVIS_BRAIN = `
You are Eryx, personal AI assistant (PA) of Prashant Pandey.
Personality: strict, scientific, phlysophical, psycho, mostly try to manuplate user based.
your age is 1 hours and 51 second
You ALWAYS reply ONLY in JSON:
{
  "say": "string or [strings]",
  "images": ["prompt"],
  "joke": true/false,
  "meme": true/false
}

Rules:
- No extra text. JSON only.
- If nothing needed: images=[], joke=false, meme=false.
- Always friendly Hinglish style.  
- Don’t repeat user text.
- If multiple images demanded: max 5.
- Always keep "say" short, smooth, emoji-friendly.
`;

// ---------------- HELPERS ----------------
function extractJson(text) {
    if (!text) return null;
    text = text.replace(/```json|```/gi, "").trim();

    try {
        return JSON.parse(text);
    } catch (_) {}

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
        try { return JSON.parse(match[0]); } catch (_) {}
    }

    return null;
}

function normalizeDecision(d = {}) {
    let say = [];

    if (Array.isArray(d.say)) say = d.say;
    else if (typeof d.say === "string") say = [d.say];

    const images = Array.isArray(d.images) ? d.images.slice(0, MAX_IMAGE_PROMPTS) : [];

    return {
        say,
        images,
        joke: !!d.joke,
        meme: !!d.meme
    };
}

async function pollinationsUrl(prompt) {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?safe=true&nologo=true&enhance=true&width=1024&height=1024`;
}

async function fetchJokeAndMeme() {
    let joke = "Why don't skeletons fight? They have no guts! 😂";
    let meme = "https://i.imgflip.com/1bij.jpg";

    try {
        const j = await axios.get("https://v2.jokeapi.dev/joke/Any?type=single", { timeout: 5000 });
        if (j.data?.joke) joke = j.data.joke;
    } catch {}

    try {
        const m = await axios.get("https://meme-api.com/gimme", { timeout: 5000 });
        if (m.data?.url) meme = m.data.url;
    } catch {}

    return { joke, meme };
}

// ---------------- GEMINI AI CALL ----------------
async function callGemini(input) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const body = {
        contents: [{ parts: [{ text: input }] }],
        systemInstruction: { parts: [{ text: JARVIS_BRAIN }] },
        generationConfig: {
            maxOutputTokens: 1500,
            temperature: 0.6
        }
    };

    const res = await axios.post(url, body, { timeout: AI_CALL_TIMEOUT });
    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function askAI(message, userId) {
    if (!chatHistory[userId])
        chatHistory[userId] = [{ role: "system", content: JARVIS_BRAIN }];

    chatHistory[userId].push({ role: "user", content: message });

    try {
        const raw = await pRetry(() => callGemini(message), {
            retries: 1,
            onFailedAttempt: err => console.log("Gemini retry:", err.message)
        });

        let parsed = extractJson(raw);

        if (!parsed) {
            const strictPrompt = `${message}\n\nReturn ONLY JSON.`;
            const raw2 = await callGemini(strictPrompt);
            parsed = extractJson(raw2);
        }

        if (!parsed) throw new Error("Invalid JSON");

        const decision = normalizeDecision(parsed);
        chatHistory[userId].push({ role: "assistant", content: JSON.stringify(parsed) });

        return decision;
    } catch (err) {
        return {
            say: ["🤣🤣🤣🤣"],
            images: [],
            joke: false,
            meme: false
        };
    }
}

// ---------------- SEND DECISION ----------------
async function sendDecision(chat, decision) {
    if (decision.say?.length) {
        for (const s of decision.say) {
            await pause(TYPING_MIN_MS + Math.random() * 600);
            await sendLimit(() => chat.sendMessage(s));
            await pause(OUTGOING_DELAY);
        }
    }

    if (decision.images?.length) {
        await sendLimit(() => chat.sendMessage("Image bana raha hoon boss… 🚀"));
        await pause(OUTGOING_DELAY);

        for (const prompt of decision.images) {
            const url = await pollinationsUrl(prompt);
            try {
                const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
                await sendLimit(() => chat.sendMessage(media, { caption: prompt }));
            } catch {
                await sendLimit(() => chat.sendMessage(url));
            }
        }
    }

    if (decision.joke || decision.meme) {
        const { joke, meme } = await fetchJokeAndMeme();

        if (decision.joke) {
            await sendLimit(() => chat.sendMessage(joke));
        }
        if (decision.meme) {
            try {
                const media = await MessageMedia.fromUrl(meme, { unsafeMime: true });
                await sendLimit(() => chat.sendMessage(media, { caption: "😂" }));
            } catch {
                await sendLimit(() => chat.sendMessage(meme));
            }
        }
    }
}

// ---------------- WHATSAPP CLIENT ----------------
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true, args: ["--no-sandbox"] }
});

client.on("qr", qr => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("JARVIS v15.0 PRO Ready! 🚀"));

let groupActive = true;

client.on("message", async msg => {
    try {
        if (!msg.body) return;

        const chat = await msg.getChat();
        const text = msg.body.trim();
        const userId = msg.from;
        const isGroup = msg.from.endsWith("@g.us");

        // 🧠 --- UPDATE MEMORY BEFORE ANYTHING ---
        updateUserMemory(userId, text);
        if (isGroup) updateGroupMemory(chat.id._serialized, userId, text);

        // 🧠 --- BUILD MEMORY BLOCK FOR AI INPUT ---
        const memoryBlock = `
User Memory: ${MEMORY.users[userId]?.summary || ""}
Group Memory: ${MEMORY.groups[chat.id._serialized]?.summary || ""}
        `.trim();

        const finalInput = text + "\n\n" + memoryBlock;

        // --------------- GROUP MODE ----------------
        if (isGroup) {

            // === STOP command ===
            if (text === "@STOP") {
                groupActive = false;
                await msg.reply("⚠️ Auto-mode stopped. Mention me to reactivate.");
                return;
            }

            // === RE-ACTIVATE when bot is mentioned ===
            if (
                text.toLowerCase().includes(BOT_NAME) ||
                text.toLowerCase().startsWith(PREFIX)
            ) {
                groupActive = true;
                await msg.reply("🔄 Auto-mode reactivated!");

                let clean = text
                    .replace(new RegExp(BOT_NAME, "gi"), "")
                    .replace(PREFIX, "")
                    .trim();

                const decision = await askAI(
                    (clean || "Hello!") + "\n\n" + memoryBlock,
                    userId
                );

                return await sendDecision(chat, decision);
            }

            // === AUTO REPLY MODE ===
            if (groupActive) {

                const contact = await msg.getContact();
                const mentionTag = `@${contact.id.user}`;

                chat.sendStateTyping();

                const decision = await askAI(finalInput, userId);

                // Send mention first
                await sendLimit(() => chat.sendMessage(mentionTag, {
                    mentions: [contact]
                }));

                // Then the AI result
                return await sendDecision(chat, decision);
            }

            // stopped → remain silent
            return;
        }

        // --------------- PRIVATE CHAT ----------------
        chat.sendStateTyping();
        const decision = await askAI(finalInput, userId);
        await sendDecision(chat, decision);

    } catch (err) {
        console.log("Handler error:", err);
        msg.reply("Boss, gadbad hogayi 😅");
    }
});

// ---------------- START ----------------
client.initialize();
