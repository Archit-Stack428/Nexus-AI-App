/* ===== REAL-TIME INTENT CLASSIFICATION ===== */
function detectQueryIntent(text) {
    const t = text.toLowerCase();
    // Weather
    if (/mausam|weather|temperature|barish|baarish|garmi|sardi|aaj ka mausam|aaj weather|tapman|humidity|forecast|rain|snow|wind|climate|monsoon|clouds|cloudy|sunny/.test(t))
        return 'weather';
    // News
    if (/news|khabar|khabaren|khabrein|latest|aaj ki khabar|today news|breaking|headlines|samachar|taza|taaza|taji|updates/.test(t))
        return 'news';
    // Wikipedia / Facts
    if (/kaun hai|kaun hain|kya hai|kya hain|who is|what is|wikipedia|history|itihas|jankari|batao|define|meaning|matlab|explain|jankaari|detail/.test(t))
        return 'wiki';
    // Time / Date
    if (/time|samay|abhi kitne baje|kitne baje|aaj kya date|aaj ki date|date today|current time|tarikh|taarikh|din/.test(t))
        return 'datetime';
    return 'general';
}

function extractCity(text) {
    let cleaned = text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const words = cleaned.split(" ");
    const stopWords = new Set([
        "weather", "mausam", "temperature", "temp", "tapman", "forecast", "report", "info", "information",
        "aaj", "today", "now", "current", "live", "kya", "hai", "hain", "kaisa", "kaisa-hai", "kaisa_hai",
        "kaisi", "kaise", "batao", "bata", "de", "do", "dijiye", "show", "get", "find", "please", "plz",
        "in", "me", "mein", "at", "of", "for", "the", "ko", "se", "ka", "ki", "ke", "how", "is", "what",
        "about", "around", "here", "there", "aajka", "aaj-ka", "aaj_ka", "hoga", "hogi", "kab", "right",
        "day", "night", "tonight", "tomorrow", "yesterday", "barish", "baarish", "rain", "rainy",
        "snow", "wind", "cloudy", "sunny", "monsoon", "clouds"
    ]);

    const filteredWords = words.filter(w => w && !stopWords.has(w));
    if (filteredWords.length > 0) {
        return filteredWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("+");
    }
    return "Delhi";
}

function extractNewsQuery(text) {
    let cleaned = text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const words = cleaned.split(" ");
    const stopWords = new Set([
        "news", "khabar", "khabaren", "khabrein", "latest", "breaking", "headlines", "samachar",
        "taza", "taaza", "taji", "batao", "bata", "de", "do", "dijiye", "show", "get", "find",
        "please", "plz", "in", "me", "mein", "at", "of", "for", "the", "ko", "se", "ka", "ki", "ke",
        "how", "is", "what", "about", "around", "here", "there", "today", "aaj", "aajki", "aaj-ki",
        "aaj_ki", "todays", "today's", "ki-khabar", "ki_khabar", "ki-khabren", "ki_khabren", "updates"
    ]);

    const filteredWords = words.filter(w => w && !stopWords.has(w));
    if (filteredWords.length > 0) {
        return filteredWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join("+");
    }
    return "top-headlines";
}

/* ===== EXTERNAL SERVICE HANDLERS ===== */
async function fetchRSS(rssUrl) {
    // 1. Try rss2json converter (cleanest JSON parsing) WITHOUT count parameter (restricted on free tier)
    try {
        const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(apiUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (data.status === 'ok' && data.items && data.items.length > 0) {
                return data.items;
            }
        }
    } catch (e) {
        console.warn("rss2json fetch failed, trying proxy...", e);
    }

    // 2. Fallback: browser-compatible AllOrigins CORS proxy with DOMParser
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
            const json = await res.json();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(json.contents, "text/xml");
            const items = xmlDoc.getElementsByTagName("item");
            if (items && items.length > 0) {
                return Array.from(items).map(item => {
                    const title = item.getElementsByTagName("title")[0]?.textContent || '';
                    const link = item.getElementsByTagName("link")[0]?.textContent || '';
                    const pubDate = item.getElementsByTagName("pubDate")[0]?.textContent || '';
                    const description = item.getElementsByTagName("description")[0]?.textContent || '';
                    const source = item.getElementsByTagName("source")[0]?.textContent || 'Google News';
                    return {
                        title: title,
                        link: link,
                        pubDate: pubDate,
                        description: description,
                        author: source
                    };
                });
            }
        }
    } catch (e) {
        console.warn("AllOrigins proxy fetch failed...", e);
    }

    throw new Error("Could not retrieve news feed from any service. Please check your internet connection.");
}

async function fetchWeatherData(text) {
    try {
        const city = extractCity(text);
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) return null;
        const data = await res.json();
        const cur = data.current_condition[0];
        const area = data.nearest_area[0];
        const areaName = area?.areaName?.[0]?.value || city;
        const country = area?.country?.[0]?.value || '';
        const weather = cur.weatherDesc[0].value;
        const tempC = cur.temp_C;
        const feelsC = cur.FeelsLikeC;
        const humidity = cur.humidity;
        const windKmph = cur.windspeedKmph;
        const visibility = cur.visibility;

        const forecast = data.weather.slice(0,3).map(day => {
            return `📅 ${day.date}: ${day.hourly[4]?.weatherDesc?.[0]?.value || ''}, Max: ${day.maxtempC}°C, Min: ${day.mintempC}°C`;
        }).join('\n');

        return `📍 Location: ${areaName}, ${country}
🌤️ Weather: ${weather}
🌡️ Temperature: ${tempC}°C (Feels like ${feelsC}°C)
💧 Humidity: ${humidity}%
💨 Wind Speed: ${windKmph} km/h
👁️ Visibility: ${visibility} km

3-Day Forecast:
${forecast}

(Data fetched live from wttr.in)`;
    } catch (e) {
        console.warn('Weather fetch error:', e);
        return null;
    }
}

async function fetchNewsData(text) {
    try {
        const query = extractNewsQuery(text);
        let rssUrl;
        if (query === 'top-headlines') {
            rssUrl = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en';
        } else {
            rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
        }

        const items = await fetchRSS(rssUrl);
        if (!items || items.length === 0) return null;

        const headlines = items.slice(0,8).map((item, i) => {
            const linkPlaceholder = LinkMapper.register(item.link);
            return `${i+1}. **Title**: ${item.title}\n   **Link**: ${linkPlaceholder}`;
        }).join('\n\n');

        const queryTitle = query === 'top-headlines' ? 'Top Headlines' : `${query.replace(/\+/g, ' ')} News`;
        return `📰 **Latest News: ${queryTitle}** (Live from Google News - ${new Date().toLocaleString('en-IN')})\n\n${headlines}\n\n*(Real-time headlines)*`;
    } catch (e) {
        console.warn('News fetch error:', e);
        return null;
    }
}

async function fetchWikiData(text) {
    try {
        const cleaned = text
            .replace(/kaun hai|kaun hain|kya hai|kya hain|who is|what is|wikipedia|batao|bata do|ke baare mein|ke bare mein|explain|define|meaning|matlab|detail/gi, '')
            .trim();
        const searchTerm = encodeURIComponent(cleaned.slice(0, 100));
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${searchTerm}&limit=1&format=json&origin=*`;
        const controller1 = new AbortController();
        const timeoutId1 = setTimeout(() => controller1.abort(), 3000);
        const sRes = await fetch(searchUrl, { signal: controller1.signal });
        clearTimeout(timeoutId1);
        const sData = await sRes.json();
        if (!sData[1] || sData[1].length === 0) return null;
        const title = encodeURIComponent(sData[1][0]);
        
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
        const sumRes = await fetch(sumUrl, { signal: controller2.signal });
        clearTimeout(timeoutId2);
        if (!sumRes.ok) return null;
        const sumData = await sumRes.json();
        const wikiUrl = sumData.content_urls?.desktop?.page || '';
        const wikiPlaceholder = wikiUrl ? LinkMapper.register(wikiUrl) : 'Wikipedia';
        return `📖 **Wikipedia: ${sumData.title}**\n\n${sumData.extract}\n\n🔗 Source: ${wikiPlaceholder}`;
    } catch (e) {
        console.warn('Wiki fetch error:', e);
        return null;
    }
}

function getCurrentDateTime() {
    const now = new Date();
    return `🕒 Current Date & Time (India): ${now.toLocaleString('en-IN', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata'
    })}`;
}

async function getRealTimeContext(text) {
    const intent = detectQueryIntent(text);
    let ctx = null;
    if (intent === 'weather') ctx = await fetchWeatherData(text);
    else if (intent === 'news') ctx = await fetchNewsData(text);
    else if (intent === 'wiki') ctx = await fetchWikiData(text);
    else if (intent === 'datetime') ctx = getCurrentDateTime();
    return ctx;
}

/* ===== GEMINI API GENERATIVE CALL ===== */
async function fetchGemini(contents, systemInstruction = null) {
    const apiKey = GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API Key configuration is missing.");

    // Optimized models list to bypass rate limits (429) on free tier, using valid models only
    const models = [
        "gemini-2.5-flash", 
        "gemini-2.5-flash-lite", 
        "gemini-2.0-flash", 
        "gemini-2.0-flash-lite", 
        "gemini-flash-latest", 
        "gemini-flash-lite-latest", 
        "gemini-3.5-flash"
    ];
    let lastError = null;

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = {
                contents: contents
            };
            if (systemInstruction) {
                payload.systemInstruction = {
                    parts: [{ text: systemInstruction }]
                };
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (response.status === 200) {
                if (data.error) throw new Error(data.error.message);
                if (!data.candidates || data.candidates.length === 0) throw new Error("No response generated from AI.");
                return data.candidates[0].content.parts[0].text;
            } else {
                const errMsg = data.error ? data.error.message : `HTTP error status ${response.status}`;
                console.warn(`Model ${model} failed: ${errMsg}`);
                lastError = new Error(errMsg);
            }
        } catch (e) {
            console.warn(`Model ${model} request error:`, e);
            lastError = e;
        }
    }
    throw lastError || new Error("All fallback models failed to respond.");
}

/* ===== PDF DOCUMENT PROCESSING ===== */
async function handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { showToast('Please upload a PDF file', 'error'); return; }

    showLoading('Reading PDF...');
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + '\n\n';
        }
        State.pdfText = fullText.trim();
        if (!State.pdfText) { showToast('Could not extract text from this PDF', 'error'); hideLoading(); return; }
        $('pdf-upload-zone').classList.add('has-file');
        $('pdf-upload-zone').innerHTML = `<i class="fas fa-file-pdf" style="color:var(--success)"></i><p style="color:var(--success)">${file.name}</p><small>${pdf.numPages} pages extracted</small>`;
        $('pdf-actions').classList.remove('hidden');
        $('pdf-question-section').classList.remove('hidden');
        $('pdf-result').classList.remove('hidden');
        $('pdf-result').textContent = `PDF loaded successfully! ${State.pdfText.length} characters extracted from ${pdf.numPages} pages.\n\nUse the buttons above to analyze the content.`;
        showToast('PDF processed successfully!', 'success');
    } catch (err) {
        showToast('Failed to process PDF: ' + err.message, 'error');
    }
    hideLoading();
    event.target.value = '';
}

async function pdfSummarize() {
    if (!State.pdfText) { showToast('Please upload a PDF first', 'error'); return; }
    showLoading('Generating summary...');
    try {
        const contents = [{
            role: 'user',
            parts: [{ text: `Here is the PDF content:\n\n${State.pdfText}\n\nProvide a comprehensive summary of this PDF content.` }]
        }];
        const systemPrompt = "You are Nexus AI PDF Assistant. Summarize the provided PDF content accurately, highlighting the most important topics.";
        const response = await fetchGemini(contents, systemPrompt);
        $('pdf-result').textContent = '';
        $('pdf-result').innerHTML = formatMessage(response);
    } catch (apiError) {
        console.error("Gemini API error during PDF summary:", apiError);
        showToast("Gemini API Error: " + apiError.message, "error");
        $('pdf-result').innerHTML = `<span style="color:var(--error)">**Error**: Failed to generate summary. ${apiError.message}</span>`;
    }
    hideLoading();
}

async function pdfKeyPoints() {
    if (!State.pdfText) { showToast('Please upload a PDF first', 'error'); return; }
    showLoading('Extracting key points...');
    try {
        const contents = [{
            role: 'user',
            parts: [{ text: `Here is the PDF content:\n\n${State.pdfText}\n\nExtract the main key points from this PDF.` }]
        }];
        const systemPrompt = "You are Nexus AI PDF Assistant. Extract key points and list them clearly as bullet points from the provided PDF content.";
        const response = await fetchGemini(contents, systemPrompt);
        $('pdf-result').textContent = '';
        $('pdf-result').innerHTML = formatMessage(response);
    } catch (apiError) {
        console.error("Gemini API error during PDF key points:", apiError);
        showToast("Gemini API Error: " + apiError.message, "error");
        $('pdf-result').innerHTML = `<span style="color:var(--error)">**Error**: Failed to extract key points. ${apiError.message}</span>`;
    }
    hideLoading();
}

function pdfFullText() {
    if (!State.pdfText) { showToast('Please upload a PDF first', 'error'); return; }
    const preview = State.pdfText.length > 3000 ? State.pdfText.substring(0, 3000) + '\n\n[... truncated, showing first 3000 characters]' : State.pdfText;
    $('pdf-result').textContent = '';
    $('pdf-result').innerHTML = formatMessage(`**Full Extracted Text**\n\n${preview}`);
}

async function pdfAskQuestion() {
    const question = $('pdf-question-input').value.trim();
    if (!question || !State.pdfText) return;
    showLoading('Searching answer...');
    try {
        const contents = [{
            role: 'user',
            parts: [{ text: `PDF content:\n\n${State.pdfText}\n\nQuestion: ${question}` }]
        }];
        const systemPrompt = "You are Nexus AI PDF Assistant. Answer the question based on the provided PDF content. If the answer is not in the text, politely state that it's not present.";
        const response = await fetchGemini(contents, systemPrompt);
        $('pdf-result').textContent = '';
        $('pdf-result').innerHTML = formatMessage(response);
        $('pdf-question-input').value = '';
    } catch (apiError) {
        console.error("Gemini API error during PDF question:", apiError);
        showToast("Gemini API Error: " + apiError.message, "error");
        $('pdf-result').innerHTML = `<span style="color:var(--error)">**Error**: Failed to search answer. ${apiError.message}</span>`;
    }
    hideLoading();
}

/* ===== IMAGE ANALYSIS & OCR ===== */
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
        $('image-preview').src = e.target.result;
        $('image-preview').classList.add('show');
        $('image-upload-zone').classList.add('has-file');
        $('image-upload-zone').innerHTML = `<i class="fas fa-image" style="color:var(--success)"></i><p style="color:var(--success)">${file.name}</p><small>Image loaded</small>`;
        $('image-actions').classList.remove('hidden');
        $('image-result').classList.remove('hidden');
        $('image-result').textContent = 'Image loaded! Use the buttons above to analyze it.';
        State.imageText = '';
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

async function imageOCR() {
    showLoading('Extracting text with OCR...');
    try {
        const result = await Tesseract.recognize($('image-preview').src, 'eng+hin', { logger: m => { } });
        State.imageText = result.data.text.trim();
        if (!State.imageText) {
            $('image-result').textContent = '';
            $('image-result').innerHTML = formatMessage('No text could be extracted from this image. The image might not contain readable text.');
        } else {
            $('image-result').textContent = '';
            $('image-result').innerHTML = formatMessage(`**Extracted Text:**\n\n${State.imageText}`);
        }
        showToast('OCR complete!', 'success');
    } catch (err) {
        showToast('OCR failed: ' + err.message, 'error');
    }
    hideLoading();
}

async function imageDescribe() {
    const img = $('image-preview');
    if (!img.src) { showToast('Please upload an image first', 'error'); return; }
    showLoading('Analyzing image...');

    try {
        const src = img.src;
        const match = src.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
        if (!match) throw new Error("Invalid image format.");
        const mimeType = match[1];
        const base64Data = match[2];

        const contents = [{
            role: 'user',
            parts: [
                { text: "Describe this image in detail. If it contains text, mention what it says. If it is a screenshot of an error or code issue, explain the error clearly and offer concrete suggestions to resolve it." },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                }
            ]
        }];
        const systemPrompt = "You are Nexus AI Multimodal Assistant. Describe the image details, explain errors or text contained within them, and be helpful and precise.";
        const response = await fetchGemini(contents, systemPrompt);
        $('image-result').textContent = '';
        $('image-result').innerHTML = formatMessage(response);
        showToast('Image analysis complete!', 'success');
    } catch (apiError) {
        console.error("Gemini API error during image description:", apiError);
        showToast("Gemini API Error: " + apiError.message, "error");
        $('image-result').innerHTML = `<span style="color:var(--error)">**Error**: Failed to analyze image. ${apiError.message}</span>`;
    }
    hideLoading();
}

async function imageAnalyze() {
    const img = $('image-preview');
    if (!img.src) { showToast('Please upload an image first', 'error'); return; }
    showLoading('Performing deep analysis...');
    try {
        const src = img.src;
        const match = src.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
        if (!match) throw new Error("Invalid image format.");
        const mimeType = match[1];
        const base64Data = match[2];

        const contents = [{
            role: 'user',
            parts: [
                { text: "Perform a deep, advanced analysis of this image. Extract all key visual elements, text, structure, colors, and design patterns. If there is code, check for logical bugs, layout errors, or security flaws." },
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                }
            ]
        }];
        const systemPrompt = "You are Nexus AI Deep Visual Analyst. Provide a structural, technical, and detailed breakdown of the image.";
        const response = await fetchGemini(contents, systemPrompt);
        $('image-result').textContent = '';
        $('image-result').innerHTML = formatMessage(response);
        showToast('Deep analysis complete!', 'success');
    } catch (apiError) {
        console.error("Gemini API error during image analysis:", apiError);
        showToast("Gemini API Error: " + apiError.message, "error");
        $('image-result').innerHTML = `<span style="color:var(--error)">**Error**: Deep analysis failed. ${apiError.message}</span>`;
    }
    hideLoading();
}

/* ===== TRANSLATION SERVICES ===== */
async function handleTranslate() {
    const text = $('translate-input').value.trim();
    if (!text) { showToast('Please enter text to translate', 'error'); return; }

    let from = $('lang-from').value;
    const to = $('lang-to').value;

    if (from === 'auto') {
        const hasHindi = /[\u0900-\u097F]/.test(text);
        from = hasHindi ? 'hi' : 'en';
    }

    if (from === to) {
        $('translate-result').textContent = text;
        $('translate-result').classList.remove('hidden');
        $('translate-actions').classList.remove('hidden');
        $('translate-actions').style.display = 'flex';
        showToast('Source and target languages are the same', 'info');
        return;
    }

    showLoading('Translating...');
    try {
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
        const data = await response.json();
        if (data.responseData && data.responseData.translatedText) {
            $('translate-result').textContent = data.responseData.translatedText;
            $('translate-result').classList.remove('hidden');
            $('translate-actions').classList.remove('hidden');
            $('translate-actions').style.display = 'flex';
            showToast('Translation complete!', 'success');
        } else {
            showToast('Translation failed. Try again.', 'error');
        }
    } catch (err) {
        showToast('Translation service unavailable. Check your connection.', 'error');
    }
    hideLoading();
}

function swapLanguages() {
    const from = $('lang-from').value;
    const to = $('lang-to').value;
    if (from !== 'auto') $('lang-from').value = to;
    $('lang-to').value = from;
    $('translate-result').textContent = '';
    $('translate-actions').classList.add('hidden');
    $('translate-actions').style.display = 'none';
}

function copyTranslation() {
    const text = $('translate-result').textContent;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast('Translation copied to clipboard!', 'success');
    });
}

function speakTranslation() {
    const text = $('translate-result').textContent;
    if (!text) return;
    if (!State.speechSynth) { showToast('Text-to-speech not supported', 'error'); return; }

    State.speechSynth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;

    const langTo = $('lang-to').value;
    u.lang = langTo === 'hi' ? 'hi-IN' : 'en-US';

    const voices = State.speechSynth.getVoices();
    const preferred = voices.find(v => v.lang.startsWith(langTo));
    if (preferred) u.voice = preferred;

    State.speechSynth.speak(u);
    showToast('Reading translation...', 'info');
}

/* ===== NETWORK MONITORING ===== */
function checkNetworkConnection() {
    const isOnline = navigator.onLine;
    const overlay = $('offline-overlay');
    if (isOnline) {
        overlay.classList.remove('show');
    } else {
        overlay.classList.add('show');
        showToast('Nexus AI requires internet connection', 'error');
    }
}

window.addEventListener('online', () => {
    $('offline-overlay').classList.remove('show');
    showToast('Internet connection restored!', 'success');
});

window.addEventListener('offline', () => {
    $('offline-overlay').classList.add('show');
    showToast('Connection lost. Working offline is disabled.', 'error');
});
