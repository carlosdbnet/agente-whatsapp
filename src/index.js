const { client, getLatestQr } = require('./services/whatsapp');
const express = require('express');
const qrcode = require('qrcode');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', async (req, res) => {
    const qr = getLatestQr();
    if (!qr) {
        return res.send('<h1>Aguardando QR Code...</h1><script>setTimeout(() => window.location.reload(), 2000);</script>');
    }

    try {
        const url = await qrcode.toDataURL(qr);
        res.send(`
            <div style="display:flex; justify-content:center; align-items:center; height:100vh; flex-direction:column;">
                <h1>Escaneie para conectar</h1>
                <img src="${url}" alt="QR Code" />
                <p>Atualiza automaticamente.</p>
                <script>setTimeout(() => window.location.reload(), 5000);</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Erro ao gerar QR Code');
    }
});

app.listen(port, () => {
    console.log(`Web Server running on port ${port}`);
});

console.log('Starting WhatsApp Client...');
client.initialize();
