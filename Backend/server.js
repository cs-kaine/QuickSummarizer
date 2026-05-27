require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Import SDK Gemini 
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

// Inisialisasi instance Gemini API 
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Configure CORS for Chrome Extension
app.use(cors()); 

// Middleware to parse JSON
app.use(express.json()); 

// Global cache for summaries
const summaryCache = {};

// Default route
app.get('/', (req, res) => {
    res.send('Quicksummarizer Backend Server is running!');
});

// Summarization endpoint
app.post('/api/summarize', async (req, res) => {
    try {
        const { url, text } = req.body;

        // Validate input
        if (!url && !text) {
            return res.status(400).json({ 
                error: "Bad Request", 
                message: "Please include 'url' or 'text' in the request body." 
            });
        }

        console.log(`[LOG] Received summarization request for: ${url ? url : 'Direct text'}`);

        // Check cache
        if (url && summaryCache[url]) {
            console.log(`[CACHE HIT] Retrieving cached data for: ${url}`);
            return res.status(200).json({
                ...summaryCache[url],
                source: "cache" 
            });
        }

        console.log(`[CACHE MISS] Contacting Gemini API for: ${url}`);
        
        // Process with Google Gemini API
        const sourceData = text ? text : url;
        
        const systemPrompt = `You are an intelligent assistant tasked with summarizing news articles for a browser extension.
Your job is to read the provided news text and generate a concise summary, analyze sentiment, and determine the news category.

REQUIRED RULES:
- Your output MUST be valid JSON format.
- Do not add any text before or after the JSON block.
- Do not use markdown formatting like \`\`\`json.
- JSON must have the exact structure like this:
{
  "summary": ["most important point 1", "most important point 2", "most important point 3"],
  "sentiment": "Positive" | "Negative" | "Neutral",
  "category": "Politics" | "Technology" | "Economy" | "Entertainment" | "Sports" | "Other"
}

News article to summarize:
"""
${sourceData}
"""`;

        // Calling Gemini 2.5 Flash model 
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json", 
                temperature: 0.3 
            }
        });
        let rawText = response.text.trim();

rawText = rawText
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();

const geminiResult = JSON.parse(rawText);
        // Save to cache
        if (url) {
            summaryCache[url] = geminiResult;
        }

        // Return to client/extension
        res.status(200).json({
            ...geminiResult,
            source: "gemini_api"
        });

    } catch (error) {
        console.error("[ERROR] Failed at summarize endpoint:", error);
        
        // Provide better error messages
        let errorMessage = error.message;
        let statusCode = 500;
        
        if (error.status === 503) {
            errorMessage = "Gemini API is currently overloaded. Please try again in a few seconds.";
            statusCode = 503;
        } else if (error.status === 429) {
            errorMessage = "Too many requests. Please wait a moment.";
            statusCode = 429;
        } else if (error.status === 401) {
            errorMessage = "Invalid API Key. Check your configuration.";
            statusCode = 401;
        }
        
        res.status(statusCode).json({ 
            error: "Error", 
            message: errorMessage,
            details: error.message 
        });
    }
});

// Server running
app.listen(PORT, () => {
    console.log(`🚀 Quicksummarizer Backend is running!`);
    console.log(`👉 Running at: http://localhost:${PORT}`);
});