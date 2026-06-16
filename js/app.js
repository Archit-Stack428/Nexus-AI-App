/* ===== PDF.js Worker Setup ===== */
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ===== SCREEN NAVIGATION ===== */
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = $(screenId);
    if (target) target.classList.add('active');
}

function showContentScreen(screenId) {
    document.querySelectorAll('.content-screen').forEach(s => s.classList.remove('active'));
    const target = $(screenId);
    if (target) target.classList.add('active');
    
    // Chat input bar and bottom nav visibility
    const isChatScreen = screenId === 'content-chat';
    const inputBar = $('chat-input-bar');
    if (inputBar) inputBar.style.display = isChatScreen ? 'flex' : 'none';
    
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = (isChatScreen || screenId === 'content-tools' || screenId === 'content-history' || screenId === 'content-profile') ? 'flex' : 'none';
    }
    
    // Update nav active state
    const navMap = { 'content-chat': 0, 'content-tools': 1, 'content-history': 2, 'content-profile': 3 };
    document.querySelectorAll('.nav-item').forEach((n, i) => n.classList.toggle('active', i === (navMap[screenId] ?? -1)));
    
    // Render data/screens
    if (screenId === 'content-history') renderHistory();
    if (screenId === 'content-profile') renderProfile();
    if (screenId === 'content-settings') renderSettings();
    if (screenId === 'content-news') loadLiveNewsFeed();
}

function switchTab(el) {
    const screenId = el.dataset.screen;
    showContentScreen(screenId);
}

/* ===== AUTHENTICATION ===== */
async function handleLogin() {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    const errEl = $('login-error');
    if (!email || !password) { 
        errEl.querySelector('span').textContent = 'Please fill in all fields'; 
        errEl.classList.add('show'); 
        return; 
    }
    const users = getUsers();
    const user = users.find(u => u.email === email);
    const hashed = await hashPassword(password);
    if (!user || user.password !== hashed) { 
        errEl.querySelector('span').textContent = 'Invalid email or password'; 
        errEl.classList.add('show'); 
        return; 
    }
    errEl.classList.remove('show');
    State.currentUser = user;

    // Generate JWT
    const token = generateJWT({ userId: user.id, email: user.email, exp: Date.now() + 86400000 });
    SafeStorage.setItem('nexus_token', token);

    enterApp();
}

async function handleSignup() {
    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;
    const confirm = $('signup-confirm').value;
    const errEl = $('signup-error');
    if (!name || !email || !password || !confirm) { 
        errEl.querySelector('span').textContent = 'Please fill in all fields'; 
        errEl.classList.add('show'); 
        return; 
    }
    if (password.length < 6) { 
        errEl.querySelector('span').textContent = 'Password must be at least 6 characters'; 
        errEl.classList.add('show'); 
        return; 
    }
    if (password !== confirm) { 
        errEl.querySelector('span').textContent = 'Passwords do not match'; 
        errEl.classList.add('show'); 
        return; 
    }
    const users = getUsers();
    if (users.find(u => u.email === email)) { 
        errEl.querySelector('span').textContent = 'Email already registered'; 
        errEl.classList.add('show'); 
        return; 
    }
    errEl.classList.remove('show');

    const hashed = await hashPassword(password);
    const newUser = { id: uuid(), name, email, password: hashed, photo: '', createdAt: new Date().toISOString() };
    users.push(newUser);
    saveUsers(users);
    State.currentUser = newUser;

    // Generate JWT
    const token = generateJWT({ userId: newUser.id, email: newUser.email, exp: Date.now() + 86400000 });
    SafeStorage.setItem('nexus_token', token);

    showToast('Account created successfully!', 'success');
    enterApp();
}

function handleLogout() {
    showModal('Logout', 'Are you sure you want to logout?', 'Logout', () => {
        SafeStorage.removeItem('nexus_token');
        SafeStorage.removeItem('nova_token');
        State.currentUser = null;
        State.currentChatId = null;
        State.currentMessages = [];
        showScreen('login-screen');
        $('login-email').value = '';
        $('login-password').value = '';
        showToast('Logged out successfully', 'info');
    }, true);
}

function enterApp() {
    $('main-app').classList.add('active');
    showScreen('main-app');
    showContentScreen('content-chat');
    startNewChat();
    initSpeechRecognition();
    checkNetworkConnection();
    
    // Apply saved theme
    const settings = JSON.parse(SafeStorage.getItem('nexus_settings_' + State.currentUser.id) || SafeStorage.getItem('nova_settings_' + State.currentUser.id) || '{}');
    if (settings.darkMode === false) {
        document.documentElement.setAttribute('data-theme', 'light');
        const dmToggle = $('dark-mode-toggle');
        if (dmToggle) dmToggle.classList.remove('active');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        const dmToggle = $('dark-mode-toggle');
        if (dmToggle) dmToggle.classList.add('active');
    }
    if (settings.autoRead) {
        State.autoRead = true;
        const arToggle = $('auto-read-toggle');
        if (arToggle) arToggle.classList.add('active');
    }
}

/* ===== PROFILE MANAGEMENT ===== */
function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please upload an image file', 'error'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
        const base64 = e.target.result;
        State.currentUser.photo = base64;

        // Save to users list
        const users = getUsers();
        const idx = users.findIndex(u => u.id === State.currentUser.id);
        if (idx >= 0) {
            users[idx].photo = base64;
            saveUsers(users);
        }

        renderProfile();
        showToast('Profile photo updated!', 'success');
    };
    reader.readAsDataURL(file);
}

function editName() {
    if (!State.currentUser) return;
    showModal('Edit Name', 'Enter your new name:', 'Save', () => {
        const input = $('edit-profile-name-input');
        const newName = input ? input.value.trim() : '';
        if (!newName) { showToast('Name cannot be empty', 'error'); return; }

        State.currentUser.name = newName;
        // Update in users database
        const users = getUsers();
        const idx = users.findIndex(u => u.id === State.currentUser.id);
        if (idx >= 0) {
            users[idx].name = newName;
            saveUsers(users);
        }

        renderProfile();
        showToast('Name updated successfully!', 'success');
    });
    // Inject input element
    $('modal-extra').innerHTML = `<input type="text" id="edit-profile-name-input" class="edit-name-input" value="${escapeHtml(State.currentUser.name)}">`;
    setTimeout(() => {
        const input = $('edit-profile-name-input');
        if (input) input.focus();
    }, 100);
}

function renderProfile() {
    if (!State.currentUser) return;

    // Set profile photo
    const photoEl = $('profile-photo');
    if (photoEl) {
        photoEl.src = State.currentUser.photo || `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23f59e0b"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
    }

    const nameEl = $('profile-name');
    if (nameEl) nameEl.textContent = State.currentUser.name;
    const emailEl = $('profile-email');
    if (emailEl) emailEl.textContent = State.currentUser.email;

    // Calculate stats
    const chats = getChats().filter(c => c.userId === State.currentUser.id);
    let totalMessages = 0;
    chats.forEach(c => totalMessages += c.messages.length);

    const statChats = $('stat-chats');
    if (statChats) statChats.textContent = chats.length;
    const statMsgs = $('stat-messages');
    if (statMsgs) statMsgs.textContent = totalMessages;
}

/* ===== SETTINGS ===== */
function clearAllData() {
    showModal('Clear All Data', 'Are you sure you want to clear all app data? This will delete all users, chats, and settings, and log you out.', 'Clear Everything', () => {
        SafeStorage.clear();
        State.currentUser = null;
        State.currentChatId = null;
        State.currentMessages = [];
        showScreen('login-screen');
        showToast('All app data cleared successfully!', 'info');
    }, true);
}

function toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);

    const toggle = $('dark-mode-toggle');
    if (toggle) {
        if (newTheme === 'dark') {
            toggle.classList.add('active');
        } else {
            toggle.classList.remove('active');
        }
    }

    // Save to user settings
    if (State.currentUser) {
        const settingsKey = 'nexus_settings_' + State.currentUser.id;
        const settings = JSON.parse(SafeStorage.getItem(settingsKey) || SafeStorage.getItem('nova_settings_' + State.currentUser.id) || '{}');
        settings.darkMode = (newTheme === 'dark');
        SafeStorage.setItem(settingsKey, JSON.stringify(settings));
    }
    showToast(`${newTheme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'success');
}

function toggleAutoRead() {
    State.autoRead = !State.autoRead;
    const toggle = $('auto-read-toggle');
    if (toggle) {
        if (State.autoRead) {
            toggle.classList.add('active');
            showToast('Auto read responses enabled', 'success');
        } else {
            toggle.classList.remove('active');
            if (State.speechSynth) State.speechSynth.cancel();
            showToast('Auto read responses disabled', 'info');
        }
    }

    // Save to user settings
    if (State.currentUser) {
        const settingsKey = 'nexus_settings_' + State.currentUser.id;
        const settings = JSON.parse(SafeStorage.getItem(settingsKey) || SafeStorage.getItem('nova_settings_' + State.currentUser.id) || '{}');
        settings.autoRead = State.autoRead;
        SafeStorage.setItem(settingsKey, JSON.stringify(settings));
    }
}

function renderSettings() {
    // API key configuration is embedded in the application code.
}

/* ===== LIVE NEWS FEED ===== */
let currentNewsTagQuery = 'top-headlines';

function selectNewsTag(el, query) {
    document.querySelectorAll('.news-tag').forEach(tag => tag.classList.remove('active'));
    el.classList.add('active');
    currentNewsTagQuery = query;
    const searchInput = $('news-feed-search-input');
    if (searchInput) searchInput.value = '';
    loadLiveNewsFeed();
}

async function loadLiveNewsFeed() {
    const container = $('news-feed-list');
    if (!container) return;
    container.innerHTML = `<div class="empty-state"><div class="loading-spinner" style="margin: 20px auto;"></div><p>Fetching live feed...</p></div>`;

    const searchInput = $('news-feed-search-input');
    let searchQuery = searchInput ? searchInput.value.trim() : '';
    let query = searchQuery || currentNewsTagQuery;

    try {
        let rssUrl;
        if (query === 'top-headlines') {
            rssUrl = 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en';
        } else {
            rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
        }

        const items = await fetchRSS(rssUrl);

        if (!items || items.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-newspaper"></i><p>No news articles found for this topic.</p></div>`;
            return;
        }

        container.innerHTML = items.map(item => {
            const date = new Date(item.pubDate);
            const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            const source = item.author || 'Google News';
            
            // Clean description from HTML tags
            let desc = item.description || '';
            desc = desc.replace(/<[^>]*>?/gm, ''); // remove html tags
            if (desc.length > 150) desc = desc.substring(0, 150) + '...';

            // Escape quotes for JS inline call
            const escapedTitle = item.title.replace(/'/g, "\\'").replace(/"/g, '\\"');
            
            return `
                <div class="news-feed-card">
                    <div class="news-feed-card-header">${source} • ${dateStr}</div>
                    <h4 class="news-feed-card-title">${item.title}</h4>
                    <p class="news-feed-card-desc">${desc}</p>
                    <div class="news-feed-card-actions">
                        <a href="${item.link}" target="_blank" class="news-feed-action-btn secondary"><i class="fas fa-arrow-up-right-from-square"></i> Read Original</a>
                        <button onclick="summarizeNewsArticle('${escapedTitle}', '${item.link}')" class="news-feed-action-btn primary"><i class="fas fa-wand-magic-sparkles"></i> Summarize with AI</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-state" style="color:var(--error)"><i class="fas fa-exclamation-triangle"></i><p>Error loading news: ${err.message}</p></div>`;
    }
}

/* ===== APP INITIALIZATION ===== */
function initApp() {
    // Simulate splash screen for 1.5 seconds, then check session
    setTimeout(() => {
        const splash = $('splash-screen');
        if (splash) splash.classList.remove('active');
        try {
            const token = SafeStorage.getItem('nexus_token') || SafeStorage.getItem('nova_token');
            const decoded = verifyJWT(token);
            if (decoded && decoded.userId) {
                const users = getUsers();
                const user = users.find(u => u.id === decoded.userId);
                if (user) {
                    State.currentUser = user;
                    enterApp();
                    return;
                }
            }
        } catch (e) {
            console.error('App init check session failed:', e);
        }
        showScreen('login-screen');
    }, 1500);
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
