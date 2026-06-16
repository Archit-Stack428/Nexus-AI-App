/* ===== CHAT SESSION MGMT ===== */
function startNewChat() {
    State.currentChatId = uuid();
    State.currentMessages = [];
    const chatArea = $('chat-messages');
    chatArea.innerHTML = '';
    // Re-add welcome
    chatArea.innerHTML = `<div id="chat-welcome" class="chat-welcome">
        <div class="chat-welcome-icon"><i class="fas fa-bolt"></i></div>
        <h2>How can I help you?</h2>
        <p>I'm Nexus AI, your smart assistant. Ask me anything!</p>
        <div class="suggestions">
            <div class="suggestion-chip" onclick="useSuggestion('Tell me a joke')">Tell me a joke</div>
            <div class="suggestion-chip" onclick="useSuggestion('What can you do?')">What can you do?</div>
            <div class="suggestion-chip" onclick="useSuggestion('Calculate 25 * 48 + 137')">Math help</div>
            <div class="suggestion-chip" onclick="useSuggestion('Tell me an interesting fact')">Fun fact</div>
        </div>
    </div>`;
}

function useSuggestion(text) {
    $('chat-input').value = text;
    $('send-btn').disabled = false;
    sendMessage();
}

async function handleChatFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Processing attachment...');
    try {
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n\n';
            }
            State.chatAttachedText = fullText.trim();
            State.chatAttachedImage = '';
            State.chatAttachedFileName = file.name;

            // Show preview
            $('chat-file-preview-name').innerHTML = `<i class="fas fa-file-pdf"></i> ${file.name} (${pdf.numPages} pages)`;
            $('chat-file-preview').classList.remove('hidden');
            showToast('PDF attached to chat!', 'success');
        } else if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                State.chatAttachedImage = e.target.result;
                State.chatAttachedText = '';
                State.chatAttachedFileName = file.name;

                // Show preview
                $('chat-file-preview-name').innerHTML = `<i class="fas fa-image"></i> ${file.name}`;
                $('chat-file-preview').classList.remove('hidden');
                showToast('Image attached to chat!', 'success');
            };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('text/') ||
            /\.(txt|json|csv|js|py|html|css|ts|jsx|tsx|sh|md|xml|yaml|yml|c|cpp|h|java|go|rs|php|sql)$/i.test(file.name)) {
            const reader = new FileReader();
            reader.onload = (e) => {
                State.chatAttachedText = e.target.result;
                State.chatAttachedImage = '';
                State.chatAttachedFileName = file.name;

                // Show preview
                $('chat-file-preview-name').innerHTML = `<i class="fas fa-file-lines"></i> ${file.name}`;
                $('chat-file-preview').classList.remove('hidden');
                showToast('Document attached to chat!', 'success');
            };
            reader.readAsText(file);
        } else {
            showToast('Unsupported file type. Please upload a PDF, Image, or Text/Code document.', 'error');
        }
    } catch (err) {
        showToast('Failed to read file: ' + err.message, 'error');
    }
    hideLoading();
    event.target.value = '';
    $('send-btn').disabled = false;
}

function removeChatAttachedFile() {
    State.chatAttachedText = '';
    State.chatAttachedImage = '';
    State.chatAttachedFileName = '';
    $('chat-file-preview').classList.add('hidden');
}

async function sendMessage() {
    const input = $('chat-input');
    const text = input.value.trim();
    if (!text && !State.chatAttachedFileName) return;

    const welcome = $('chat-welcome');
    if (welcome) welcome.remove();

    let userMessageContent = text;
    if (State.chatAttachedFileName) {
        if (State.chatAttachedText) {
            userMessageContent = `[Attached Document: ${State.chatAttachedFileName}]\n\n${text}`;
        } else if (State.chatAttachedImage) {
            userMessageContent = `[Attached Image: ${State.chatAttachedFileName}]\n\n${text}`;
        }
    }

    addMessage('user', userMessageContent, State.chatAttachedImage);

    const userMsgObj = {
        role: 'user',
        content: userMessageContent,
        timestamp: new Date().toISOString()
    };
    if (State.chatAttachedImage) {
        userMsgObj.image = State.chatAttachedImage;
    }
    State.currentMessages.push(userMsgObj);

    input.value = '';
    input.style.height = 'auto';

    const attachedText = State.chatAttachedText;
    const attachedImage = State.chatAttachedImage;
    removeChatAttachedFile();

    showTyping();

    let realtimeCtx = null;
    try { realtimeCtx = await getRealTimeContext(text || userMessageContent); } catch(_) {}

    try {
        let response = "";
        const apiKey = GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("Gemini API Key is missing in the configuration.");
        }

        let contents = [];
        for (let i = 0; i < State.currentMessages.length; i++) {
            const m = State.currentMessages[i];
            const role = m.role === 'user' ? 'user' : 'model';

            if (i === State.currentMessages.length - 1 && attachedImage) {
                const match = attachedImage.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
                if (match) {
                    contents.push({
                        role: 'user',
                        parts: [
                            { text: m.content },
                            {
                                inlineData: {
                                    mimeType: match[1],
                                    data: match[2]
                                }
                            }
                        ]
                    });
                } else {
                    contents.push({ role, parts: [{ text: m.content }] });
                }
            } else {
                contents.push({ role, parts: [{ text: m.content }] });
            }
        }

        let systemPrompt = `Your name is Nexus AI. You are a highly advanced, smart, helpful, and friendly AI assistant created and developed by Archit. If the user asks 'who made you', 'who created you', 'who developed you', 'who trained you', or anything about your developer/creator, you MUST state clearly and proudly that you were built/created/developed by Archit, followed by a short, enthusiastic introduction of yourself and your features. Never say you are built or trained by Google or OpenAI. 

Respond in normal, clear, and natural Hindi (or Hinglish if the query is in English/Hinglish). Use simple, everyday Hindi/Hinglish (avoiding overly complex, academic, or ancient Sanskritized Hindi, and avoiding pure robotic/formal language; keep it modern, friendly, and easy to understand, like a knowledgeable companion). Explain coding, programming troubleshooting, mathematics, and logic step-by-step. Use Markdown for formatting, and specify programming languages in code blocks.

When news data is available in the LIVE DATA context, you MUST present the news headlines as a clean, numbered list. For each headline, write a one-sentence summary in normal Hindi/Hinglish, followed immediately by its direct link in the format: [Read Full News](URL). You MUST copy the URL EXACTLY as it is written in the Link field of the context, without any modifications, truncation, or adding ellipsis (...). If you truncate a URL with '...', the link will be broken. The URL in [Read Full News](URL) must be 100% complete and identical to the Link in the context. Never combine multiple news items into a single bullet point, never group them under headings, and never write paragraphs or essays. Every news item MUST have its link, and you must NOT include channel names (sources) or publication dates.`;

        if (realtimeCtx) {
            systemPrompt += `\n\nNOTE: Neeche real-time live data diya gaya hai jo abhi fetch kiya gaya hai. Is data ko use karke user ka jawab do — bilkul accurate aur latest info ke saath:\n\n--- LIVE DATA ---\n${realtimeCtx}\n--- END LIVE DATA ---`;
        }

        if (attachedText) {
            systemPrompt += " User ne ek document attach kiya hai. Us document ko padh ke user ke sawaalon ka jawab do. Specific content refer karo.";
        }
        response = await fetchGemini(contents, systemPrompt);

        hideTyping();
        addMessage('assistant', response);
        State.currentMessages.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });

        if (State.autoRead) speakText(response);

        saveCurrentChat();
    } catch (err) {
        hideTyping();
        showToast("Error generating response: " + err.message, "error");
        addMessage('assistant', `**Error**: Failed to generate response.\n\nReason: ${err.message}\n\n*Please ensure your Gemini API Key in Settings is valid and you have a stable internet connection.*`);
        State.currentMessages.push({ role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date().toISOString() });
        saveCurrentChat();
    }
}

function addMessage(role, content, imageUrl = null) {
    const chatArea = $('chat-messages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const avatarContent = role === 'user' ? (State.currentUser?.name?.[0] || 'U').toUpperCase() : '<i class="fas fa-bolt"></i>';
    const actionsHtml = role === 'assistant' ? `<div class="msg-actions">
        <button class="msg-action-btn" onclick="copyMessage(this)"><i class="fas fa-copy"></i> Copy</button>
        <button class="msg-action-btn" onclick="regenerateMessage(this)"><i class="fas fa-rotate"></i> Regenerate</button>
        <button class="msg-action-btn" onclick="speakMessage(this)"><i class="fas fa-volume-high"></i> Read</button>
    </div>` : '';

    let imgHtml = '';
    if (imageUrl) {
        imgHtml = `<img src="${imageUrl}" style="max-width:100%; max-height: 180px; border-radius:8px; margin-top:8px; display:block; object-fit: contain;">`;
    }

    msgDiv.innerHTML = `<div class="msg-avatar">${avatarContent}</div>
        <div><div class="msg-bubble">${formatMessage(content)}${imgHtml}</div>${actionsHtml}</div>`;
    chatArea.appendChild(msgDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function showTyping() {
    const chatArea = $('chat-messages');
    const typing = document.createElement('div');
    typing.className = 'message assistant';
    typing.id = 'typing-indicator';
    typing.innerHTML = `<div class="msg-avatar"><i class="fas fa-bolt"></i></div>
        <div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    chatArea.appendChild(typing);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
    const t = $('typing-indicator');
    if (t) t.remove();
}

function copyMessage(btn) {
    const bubble = btn.closest('.message').querySelector('.msg-bubble');
    const text = bubble.innerText;
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'success'));
}

function speakMessage(btn) {
    const bubble = btn.closest('.message').querySelector('.msg-bubble');
    speakText(bubble.innerText);
}

async function regenerateMessage(btn) {
    const msgDiv = btn.closest('.message');
    const lastUserMsg = [...State.currentMessages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
        State.currentMessages.pop();
        msgDiv.remove();
        showTyping();

        try {
            let response = "";
            const apiKey = GEMINI_API_KEY;
            if (!apiKey) {
                throw new Error("Gemini API Key is missing in the configuration.");
            }
            const contents = [];
            for (let i = 0; i < State.currentMessages.length; i++) {
                const m = State.currentMessages[i];
                const role = m.role === 'user' ? 'user' : 'model';
                if (m.image) {
                    const match = m.image.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
                    if (match) {
                        contents.push({
                            role: 'user',
                            parts: [
                                { text: m.content },
                                {
                                    inlineData: {
                                        mimeType: match[1],
                                        data: match[2]
                                    }
                                }
                            ]
                        });
                    } else {
                        contents.push({ role, parts: [{ text: m.content }] });
                    }
                } else {
                    contents.push({ role, parts: [{ text: m.content }] });
                }
            }
            const systemPrompt = "Your name is Nexus AI. You are a highly advanced, smart, helpful, and friendly AI assistant created and developed by Archit. If the user asks 'who made you', 'who created you', 'who developed you', 'who trained you', or anything about your developer/creator, you MUST state clearly and proudly that you were built/created/developed by Archit, followed by a short, enthusiastic introduction of yourself and your features. Never say you are built or trained by Google or OpenAI. Respond in normal, clear, and natural Hindi (or Hinglish if the query is in English/Hinglish). Use simple, everyday Hindi/Hinglish (avoiding overly complex, academic, or ancient Sanskritized Hindi, and avoiding pure robotic/formal language; keep it modern, friendly, and easy to understand, like a knowledgeable companion). Explain coding, programming troubleshooting, mathematics, and logic step-by-step. Use Markdown for formatting, and specify programming languages in code blocks. When news data is available in the LIVE DATA context, you MUST present the news headlines as a clean, numbered list. For each headline, write a one-sentence summary in normal Hindi/Hinglish, followed immediately by its direct link in the format: [Read Full News](URL). You MUST copy the URL EXACTLY as it is written in the Link field of the context, without any modifications, truncation, or adding ellipsis (...). If you truncate a URL with '...', the link will be broken. The URL in [Read Full News](URL) must be 100% complete and identical to the Link in the context. Never combine multiple news items into a single bullet point, never group them under headings, and never write paragraphs or essays. Every news item MUST have its link, and you must NOT include channel names (sources) or publication dates.";
            response = await fetchGemini(contents, systemPrompt);

            hideTyping();
            addMessage('assistant', response);
            State.currentMessages.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
            saveCurrentChat();
        } catch (err) {
            hideTyping();
            showToast("Error regenerating response: " + err.message, "error");
            addMessage('assistant', `**Error**: Failed to regenerate response.\n\nReason: ${err.message}`);
        }
    }
}

function clearCurrentChat() {
    showModal('Clear Chat', 'Are you sure you want to clear the messages in this chat?', 'Clear', () => {
        State.currentMessages = [];
        const chatArea = $('chat-messages');
        chatArea.innerHTML = '';
        saveCurrentChat();
        showToast('Chat cleared', 'info');
    }, true);
}

function saveCurrentChat() {
    if (!State.currentUser || !State.currentChatId) return;
    const chats = getChats();
    const idx = chats.findIndex(c => c.id === State.currentChatId);
    
    const firstMsg = State.currentMessages[0]?.content || "New Chat";
    const title = firstMsg.length > 25 ? firstMsg.substring(0, 25) + '...' : firstMsg;

    if (idx >= 0) {
        chats[idx].messages = State.currentMessages;
        chats[idx].updatedAt = new Date().toISOString();
    } else {
        const newChat = {
            id: State.currentChatId,
            userId: State.currentUser.id,
            title: title,
            messages: State.currentMessages,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        chats.push(newChat);
    }
    saveChats(chats);
}

function loadChat(chatId) {
    const chats = getChats();
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    State.currentChatId = chatId;
    State.currentMessages = chat.messages || [];

    const chatArea = $('chat-messages');
    chatArea.innerHTML = '';

    if (State.currentMessages.length === 0) {
        startNewChat();
    } else {
        const welcome = $('chat-welcome');
        if (welcome) welcome.remove();

        State.currentMessages.forEach(msg => {
            addMessage(msg.role === 'user' ? 'user' : 'assistant', msg.content, msg.image);
        });
    }

    showContentScreen('content-chat');
}

function renderHistory() {
    if (!State.currentUser) return;
    const query = ($('history-search')?.value || '').toLowerCase();
    let chats = getChats().filter(c => c.userId === State.currentUser.id);
    if (query) chats = chats.filter(c => c.title.toLowerCase().includes(query) || c.messages.some(m => m.content.toLowerCase().includes(query)));
    chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const list = $('history-list');
    if (chats.length === 0) {
        list.innerHTML = `<div class="empty-state"><i class="fas fa-comments"></i><p>${query ? 'No matching conversations found' : 'No conversations yet. Start chatting!'}</p></div>`;
        return;
    }
    list.innerHTML = chats.map(c => {
        const date = new Date(c.updatedAt);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const msgCount = c.messages.length;
        return `<div class="history-item" onclick="loadChat('${c.id}')">
            <div class="history-item-icon"><i class="fas fa-message"></i></div>
            <div class="history-item-info">
                <div class="history-item-title">${escapeHtml(c.title)}</div>
                <div class="history-item-date">${dateStr} · ${msgCount} messages</div>
            </div>
            <button class="history-item-delete" onclick="event.stopPropagation();deleteChat('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>`;
    }).join('');
}

function deleteChat(id) {
    showModal('Delete Chat', 'Are you sure you want to delete this conversation?', 'Delete', () => {
        let chats = getChats().filter(c => c.id !== id);
        saveChats(chats);
        if (State.currentChatId === id) startNewChat();
        renderHistory();
        showToast('Chat deleted', 'info');
    }, true);
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function autoResizeInput(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = (textarea.scrollHeight) + 'px';
}

function handleInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function summarizeNewsArticle(title, link) {
    showContentScreen('content-chat');
    removeChatAttachedFile();
    const input = $('chat-input');
    const linkPlaceholder = LinkMapper.register(link);
    input.value = `Summarize and explain this news article in simple Hindi: "${title}" (Link: ${linkPlaceholder})`;
    autoResizeInput(input);
    sendMessage();
}

/* ===== VOICE STT TRIGGERS ===== */
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    State.recognition = new SR();
    State.recognition.continuous = false;
    State.recognition.interimResults = false;
    State.recognition.lang = 'en-US';
    State.recognition.onresult = (e) => {
        const text = e.results[0][0].transcript;
        $('chat-input').value = text;
        $('send-btn').disabled = false;
        stopRecording();
    };
    State.recognition.onerror = () => stopRecording();
    State.recognition.onend = () => stopRecording();
}

function toggleVoiceInput() {
    if (!State.recognition) { showToast('Voice input not supported in this browser', 'error'); return; }
    if (State.isRecording) { State.recognition.stop(); stopRecording(); }
    else { State.isRecording = true; $('mic-btn').classList.add('recording'); State.recognition.start(); showToast('Listening... Speak now', 'info'); }
}

function stopRecording() {
    State.isRecording = false;
    $('mic-btn').classList.remove('recording');
}
