const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { generateResponse, generateImage, transcribeAudio } = require('./openai');

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Should be used with caution, but often helps in container/restricted envs
            '--disable-gpu'
        ]
    }
});

// Store QR Code globally to serve via web
let lastQrCode = null;

client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    lastQrCode = qr; // Save for web view
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('Client is ready!');
});

// Map to store conversation history per chat
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 10; // Keep last 10 messages

client.on('message', async msg => {
    // Check if we need to filter messages
    if (process.env.ALLOWED_NUMBERS) {
        const allowedNumbers = process.env.ALLOWED_NUMBERS.split(',').map(n => n.trim().replace(/\D/g, ''));
        const sender = msg.from.replace(/\D/g, '');

        // If the sender is not in the allowed list, ignore the message
        if (!allowedNumbers.includes(sender)) {
            // Optional: console.log(`Blocked message from ${msg.from}`);
            return;
        }
    }
    // Only process messages with !bot prefix for now, but we'll include history
    // We might want to rethink the prefix if we want a continuous conversation feel
    if (msg.body.startsWith('!bot ')) {
        const chatId = msg.from;
        const prompt = msg.body.slice(5);

        // Initialize history for this chat if it doesn't exist
        if (!conversationHistory.has(chatId)) {
            conversationHistory.set(chatId, []);
        }

        const history = conversationHistory.get(chatId);

        // Add user message to history
        history.push({ role: "user", content: prompt });

        // Keep history size in check
        if (history.length > MAX_HISTORY_LENGTH) {
            history.shift(); // Remove oldest message
        }

        try {
            // Send entire history to OpenAI
            const response = await generateResponse(history);

            // Add bot response to history
            history.push({ role: "assistant", content: response });

            // Keep history size in check (after adding response)
            if (history.length > MAX_HISTORY_LENGTH) {
                history.shift();
            }

            msg.reply(response);
        } catch (error) {
            console.error('Error generating response:', error);
            msg.reply('Desculpe, ocorreu um erro ao processar sua solicitação.');
        }
    } else if (msg.body.startsWith('!img ')) {
        const prompt = msg.body.slice(5);
        msg.reply('🎨 Criando sua imagem... aguarde um momento.');

        try {
            const imageUrl = await generateImage(prompt);
            const media = await MessageMedia.fromUrl(imageUrl);
            client.sendMessage(msg.from, media, { caption: `Imagem gerada para: "${prompt}"` });
        } catch (error) {
            console.error('Error generating image:', error);
            msg.reply('Desculpe, não consegui gerar a imagem. Tente novamente com outra descrição.');
        }
    } else if (msg.hasMedia) {
        // Check if message is audio or voice note (ptt)
        if (msg.type === 'ptt' || msg.type === 'audio') {
            console.log('Voice message received, downloading...');
            try {
                const media = await msg.downloadMedia();

                // Determine file extension based on mimetype if possible, or default to .ogg for WhatsApp voice notes
                const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'ogg';
                const tempFilePath = `./temp_audio_${msg.from.replace(/\D/g, '')}.${extension}`;

                // Process buffer to file
                fs.writeFileSync(tempFilePath, media.data, 'base64');

                console.log('Transcribing audio...');
                const transcription = await transcribeAudio(tempFilePath);
                console.log('Transcription:', transcription);

                // Clean up temp file
                fs.unlinkSync(tempFilePath);

                // Reply with transcription (optional, verifies it heard correctly)
                msg.reply(`🎤 *Transcrição:* "${transcription}"`);

                // Add to history and generate response
                const chatId = msg.from;
                // Initialize history if needed
                if (!conversationHistory.has(chatId)) {
                    conversationHistory.set(chatId, []);
                }
                const history = conversationHistory.get(chatId);

                // Add transcribed text as user message
                history.push({ role: "user", content: transcription });
                if (history.length > MAX_HISTORY_LENGTH) history.shift();

                // Generate AI response
                const response = await generateResponse(history);

                // Add response to history
                history.push({ role: "assistant", content: response });
                if (history.length > MAX_HISTORY_LENGTH) history.shift();

                msg.reply(response);

            } catch (error) {
                console.error('Error processing audio:', error);
                msg.reply('Desculpe, tive um problema ao ouvir seu áudio.');
            }
        }
    }
});

module.exports = { client, getLatestQr: () => lastQrCode };
