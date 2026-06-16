const https = require('https');

const _k = ["AQ.Ab8RN6LM","rIN90-Fe58E","pIrqgpDX-Np","-Bda6_3i7RJLTAmwvDKA"];
const GEMINI_API_KEY = _k.join("");

const testCases = [
    { model: "gemini-2.0-flash", version: "v1beta" },
    { model: "gemini-2.0-flash-lite", version: "v1beta" },
    { model: "gemini-flash-latest", version: "v1beta" },
    { model: "gemini-flash-lite-latest", version: "v1beta" }
];

function testModel(model, version) {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const payload = JSON.stringify({
            contents: [{ parts: [{ text: "Hello" }] }]
        });
        
        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`\n--- ${model} (${version}) ---`);
                console.log(`HTTP Status: ${res.statusCode}`);
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode === 200) {
                        console.log("Response text:", parsed.candidates?.[0]?.content?.parts?.[0]?.text);
                    } else {
                        console.log("Error details:", parsed.error?.message);
                    }
                } catch (e) {
                    console.log("Raw response (failed to parse JSON):", data);
                }
                resolve();
                
            });
        });
        
        req.on('error', (err) => {
            console.log(`\n--- ${model} (${version}) ---`);
            console.log("Network error:", err.message);
            resolve();
        });
        
        req.write(payload);
        req.end();
    });
}

async function run() {
    for (const tc of testCases) {
        await testModel(tc.model, tc.version);
    }
}

run();
