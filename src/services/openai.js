require('dotenv').config();
const { OpenAI } = require('openai');
const fs = require('fs');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function generateResponse(messages) {
    try {
        let systemContent = process.env.systema_prompty || process.env.SYSTEM_PROMPT || "Você é um assistente útil e amigável.";

        // Try to read from file if configured
        if (process.env.SYSTEM_PROMPT_FILE) {
            try {
                const filePath = process.env.SYSTEM_PROMPT_FILE;
                if (fs.existsSync(filePath)) {
                    systemContent = fs.readFileSync(filePath, 'utf8');
                }
            } catch (err) {
                console.error("Error reading system prompt file:", err);
            }
        }

        const systemMessage = {
            role: "system",
            content: systemContent
        };

        const completion = await openai.chat.completions.create({
            messages: [systemMessage, ...messages],
            model: "gpt-3.5-turbo",
        });

        return completion.choices[0].message.content;
    } catch (error) {
        console.error("OpenAI API Error:", error);
        throw error;
    }
}

// ... existing code ...
async function generateImage(prompt) {
    try {
        const response = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            n: 1,
            size: "1024x1024",
        });

        return response.data[0].url;
    } catch (error) {
        console.error("OpenAI Image Generation Error:", error);
        throw error;
    }
}

async function transcribeAudio(filePath) {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: "whisper-1",
            language: "pt", // Force Portuguese or detect automatically
        });

        return transcription.text;
    } catch (error) {
        console.error("OpenAI Transcription Error:", error);
        throw error;
    }
}

module.exports = { generateResponse, generateImage, transcribeAudio };
