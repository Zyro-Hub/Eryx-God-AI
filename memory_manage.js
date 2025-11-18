// =============================================================
// MEMORY MANAGER v3.0 — Perfect Long-Term AI Memory System
// Fully Modular for WhatsApp Bots (Groups + Private)
// By: Prashant Pandey
// =============================================================

const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");

// ---------- CONFIG ----------
const MEMORY_PATH = path.resolve(__dirname, "memory/memory.json");

// Gemini API (used for summarizing)
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_KEY = "AIzaSyC3wvrKGG7M75523LL-rN_nURX3b0N1aEY";
const AI_CALL_TIMEOUT = 15000;

// ---------- INTERNAL STATE ----------
let MEMORY = {
    users: {},
    groups: {},
    global: {
        facts: [],
        events: []
    }
};

// ---------- LOAD MEMORY ----------
if (fs.existsSync(MEMORY_PATH)) {
    try {
        MEMORY = fs.readJsonSync(MEMORY_PATH);
    } catch {
        console.log("❌ Memory file corrupted. Resetting.");
    }
}

// ---------- SAVE MEMORY ----------
function saveMemory() {
    fs.writeJsonSync(MEMORY_PATH, MEMORY, { spaces: 2 });
}

// ---------- GEMINI CALL ----------
async function callGeminiForMemory(prompt) {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.4
            }
        };

        const res = await axios.post(url, body, { timeout: AI_CALL_TIMEOUT });
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (e) {
        console.log("Memory Summarizer AI Error →", e.message);
        return "";
    }
}

// ---------- UPDATE USER MEMORY ----------
function updateUserMemory(userId, message) {
    if (!MEMORY.users[userId])
        MEMORY.users[userId] = {
            messages: [],
            summary: "",
            personality: "",
            likes: []
        };

    const u = MEMORY.users[userId];

    u.messages.push(message);
    if (u.messages.length > 40) u.messages.shift();

    saveMemory();
}

// ---------- UPDATE GROUP MEMORY ----------
function updateGroupMemory(groupId, userId, message) {
    if (!MEMORY.groups[groupId])
        MEMORY.groups[groupId] = {
            logs: [],
            topics: [],
            summary: ""
        };

    const g = MEMORY.groups[groupId];

    g.logs.push({ user: userId, msg: message, time: Date.now() });
    if (g.logs.length > 80) g.logs.shift();

    saveMemory();
}

// ---------- AUTO SUMMARY ----------
async function autoSummarizeMemory() {
    try {
        // Summarize each user
        for (const uid in MEMORY.users) {
            const u = MEMORY.users[uid];
            if (u.messages.length < 6) continue;

            const raw = u.messages.join("\n");

            const summary = await callGeminiForMemory(
                `Summarize this user's behaviour, personality, topics and preferences briefly:\n${raw}`
            );

            if (summary) u.summary = summary.slice(0, 500);
        }

        // Summarize each group
        for (const gid in MEMORY.groups) {
            const g = MEMORY.groups[gid];
            if (g.logs.length < 6) continue;

            const raw = g.logs.map(e => e.msg).join("\n");

            const summary = await callGeminiForMemory(
                `Summarize this group's attitude, mood, discussions and vibe:\n${raw}`
            );

            if (summary) g.summary = summary.slice(0, 500);
        }

        saveMemory();

    } catch (e) {
        console.log("❌ Auto Memory Summarizer Error:", e.message);
    }
}

// Run every 2 minutes
setInterval(autoSummarizeMemory, 120000);

// ---------- EXPORTS ----------
module.exports = {
    MEMORY,
    saveMemory,
    updateUserMemory,
    updateGroupMemory,
    autoSummarizeMemory
};
