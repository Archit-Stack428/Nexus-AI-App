/* ===== STATE MANAGEMENT & CONFIG ===== */
const _k = ["AQ.Ab8RN6LM", "rIN90-Fe58E", "pIrqgpDX-Np", "-Bda6_3i7RJLTAmwvDKA"];
const GEMINI_API_KEY = _k.join("");

const State = {
    currentUser: null,
    currentChatId: null,
    currentMessages: [],
    pdfText: '',
    imageText: '',
    chatAttachedText: '',
    chatAttachedImage: '',
    chatAttachedFileName: '',
    isRecording: false,
    autoRead: false,
    speechSynth: window.speechSynthesis,
    recognition: null
};

/* ===== SAFE STORAGE WRAPPER ===== */
const SafeStorage = {
    getItem(key) {
        try {
            return window.localStorage.getItem(key);
        } catch (e) {
            console.warn('SafeStorage.getItem failed:', e);
            return this[key] || null;
        }
    },
    setItem(key, value) {
        try {
            window.localStorage.setItem(key, value);
        } catch (e) {
            console.warn('SafeStorage.setItem failed:', e);
            this[key] = String(value);
        }
    },
    removeItem(key) {
        try {
            window.localStorage.removeItem(key);
        } catch (e) {
            console.warn('SafeStorage.removeItem failed:', e);
            delete this[key];
        }
    },
    clear() {
        try {
            window.localStorage.clear();
        } catch (e) {
            console.warn('SafeStorage.clear failed:', e);
            for (const key in this) {
                if (typeof this[key] === 'string') delete this[key];
            }
        }
    }
};

/* ===== LINK MAPPER FOR LONG URLS ===== */
const LinkMapper = {
    _map: new Map(),
    _counter: 0,

    init() {
        try {
            const saved = SafeStorage.getItem('nexus_link_map');
            if (saved) {
                const parsed = JSON.parse(saved);
                this._map = new Map(Object.entries(parsed));
                let max = 0;
                for (const key of this._map.keys()) {
                    const num = parseInt(key.replace('NEXUS_NEWS_LNK_', ''), 10);
                    if (num > max) max = num;
                }
                this._counter = max;
            }
        } catch (e) {
            console.warn("Error initializing LinkMapper:", e);
        }
    },

    save() {
        try {
            if (this._map.size > 500) {
                const entries = Array.from(this._map.entries());
                const keysToRemove = entries.slice(0, entries.length - 500).map(e => e[0]);
                for (const k of keysToRemove) {
                    this._map.delete(k);
                }
            }
            const obj = Object.fromEntries(this._map);
            SafeStorage.setItem('nexus_link_map', JSON.stringify(obj));
        } catch (e) {
            console.warn("Error saving LinkMapper:", e);
        }
    },

    register(url) {
        if (!url) return '';
        if (url.startsWith('NEXUS_NEWS_LNK_')) return url;

        for (const [key, val] of this._map.entries()) {
            if (val === url) return key;
        }

        this._counter++;
        const placeholder = `NEXUS_NEWS_LNK_${this._counter}`;
        this._map.set(placeholder, url);
        this.save();
        return placeholder;
    },

    resolve(placeholder) {
        return this._map.get(placeholder) || placeholder;
    },

    hideLinks(text) {
        if (typeof text !== 'string') return text;
        const urlRegex = /(https?:\/\/[^\s\)\"\'\>]+)/g;
        return text.replace(urlRegex, (url) => {
            if (url.includes('news.google.com') || url.length > 50) {
                return this.register(url);
            }
            return url;
        });
    },

    restoreLinks(text) {
        if (typeof text !== 'string') return text;
        const placeholderRegex = /NEXUS_NEWS_LNK_\d+/g;
        return text.replace(placeholderRegex, (placeholder) => {
            return this.resolve(placeholder);
        });
    }
};

// Initialize LinkMapper
LinkMapper.init();

/* ===== UTILITY FUNCTIONS ===== */
function $(id) { return document.getElementById(id); }
function uuid() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 9); }
async function hashPassword(pw) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pw);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ===== JWT AUTHENTICATION ===== */
function generateJWT(payload) {
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = btoa(JSON.stringify(payload));
    const signature = btoa(header + "." + body + ".nexus_secret_key");
    return `${header}.${body}.${signature}`;
}

function verifyJWT(token) {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch (e) {
        return null;
    }
}

function getAuthenticatedUserId() {
    const token = SafeStorage.getItem('nexus_token') || SafeStorage.getItem('nova_token');
    const decoded = verifyJWT(token);
    if (!decoded) {
        State.currentUser = null;
        SafeStorage.removeItem('nexus_token');
        SafeStorage.removeItem('nova_token');
        showScreen('login-screen');
        return null;
    }
    return decoded.userId;
}

function getUsers() { return JSON.parse(SafeStorage.getItem('nexus_users') || SafeStorage.getItem('nova_users') || '[]'); }
function saveUsers(users) { SafeStorage.setItem('nexus_users', JSON.stringify(users)); }

function getChats() {
    const userId = getAuthenticatedUserId();
    if (!userId) return [];
    const allChats = JSON.parse(SafeStorage.getItem('nexus_chats') || SafeStorage.getItem('nova_chats') || '[]');
    return allChats.filter(c => c.userId === userId);
}

function saveChats(chats) {
    const userId = getAuthenticatedUserId();
    if (!userId) return;
    const allChats = JSON.parse(SafeStorage.getItem('nexus_chats') || SafeStorage.getItem('nova_chats') || '[]');
    const otherChats = allChats.filter(c => c.userId !== userId);
    const updatedChats = [...otherChats, ...chats];
    SafeStorage.setItem('nexus_chats', JSON.stringify(updatedChats));
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    t.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    $('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function showLoading(text = 'Processing...') { $('loading-text').textContent = text; $('loading-overlay').classList.add('show'); }
function hideLoading() { $('loading-overlay').classList.remove('show'); }

function showModal(title, message, confirmText, onConfirm, isDanger = false) {
    $('modal-title').textContent = title;
    $('modal-message').textContent = message;
    $('modal-extra').innerHTML = '';
    const btn = $('modal-confirm-btn');
    btn.textContent = confirmText;
    btn.className = `modal-btn ${isDanger ? 'danger' : 'confirm'}`;
    btn.onclick = () => { closeModal(); onConfirm(); };
    $('modal-overlay').classList.add('show');
}
function closeModal() { $('modal-overlay').classList.remove('show'); }

function formatMessage(text) {
    const restored = LinkMapper.restoreLinks(text);
    return restored
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color:var(--accent); text-decoration:underline; font-weight:600;">$1</a>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code style="background:var(--bg-elevated);padding:1px 5px;border-radius:4px;font-size:12px">$1</code>')
        .replace(/\n/g, '<br>');
}

function speakText(text) {
    if (!State.speechSynth) return;
    State.speechSynth.cancel();
    // Strip markdown formatting for cleaner speech
    const cleanText = text.replace(/[*_`#]/g, '').replace(/\[(.*?)\]\((.*?)\)/g, '$1');
    const u = new SpeechSynthesisUtterance(cleanText);
    u.rate = 0.95;
    u.pitch = 1;
    
    // Check if Hindi voice is available, otherwise use default
    const voices = State.speechSynth.getVoices();
    const preferred = voices.find(v => v.lang.includes('hi') || v.lang.includes('HI'));
    if (preferred) {
        u.voice = preferred;
        u.lang = 'hi-IN';
    } else {
        u.lang = 'en-US';
    }
    
    State.speechSynth.speak(u);
}
