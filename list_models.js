const https = require('https');

const _k = ["AQ.Ab8RN6LM","rIN90-Fe58E","pIrqgpDX-Np","-Bda6_3i7RJLTAmwvDKA"];
const GEMINI_API_KEY = _k.join("");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log(`HTTP Status: ${res.statusCode}`);
        try {
            const parsed = JSON.parse(data);
            if (res.statusCode === 200 && parsed.models) {
                console.log("Available models:");
                parsed.models.forEach(m => {
                    console.log(`- Name: ${m.name}, Display: ${m.displayName}, Methods: ${m.supportedGenerationMethods.join(', ')}`);
                });
            } else {
                console.log("Response:", JSON.stringify(parsed, null, 2));
            }
        } catch (e) {
            console.log("Raw response (failed to parse JSON):", data);
        }
    });
}).on('error', (err) => {
    console.error("Network error:", err.message);
});
