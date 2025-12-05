const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { WebcastPushConnection } = require('tiktok-live-connector');
const { spawn } = require('child_process'); // CAMBIO: Usamos spawn en vez de exec

let mainWindow, chatWindow, statsWindow;
let tiktokConnection = null; 
let processedGifts = new Map();
let psProcess = null; // Variable para mantener PowerShell vivo

// --- LIMPIEZA AUTOMÁTICA DE MEMORIA ---
// Revisa cada 60 segundos y borra regalos procesados hace más de 2 minutos
setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    for (const [uid, timestamp] of processedGifts.entries()) {
        if (now - timestamp > 120000) { // 2 minutos de vida
            processedGifts.delete(uid);
            deletedCount++;
        }
    }
    if(deletedCount > 0) console.log(`🧹 Limpieza: Se olvidaron ${deletedCount} regalos antiguos.`);
}, 60000);

// --- ESTADÍSTICAS ---
let sessionStats = {
    users: new Map(),
    biggestGift: { username: 'Nadie', giftName: '-', coins: 0 },
    startTime: Date.now()
};

// --- ESTADO INICIAL ---
let appState = {
    currentProfile: "Default",
    profiles: {
        "Default": { 
            username: "", targetWindow: "", rules: [],
            chatSettings: {
                showUserChat: true, showRulesMatches: false, filterBots: true,
                showMentions: false, showGifts: true, showFollows: true, showShares: true,
                showChests: true, showJoins: true, showSubscribes: true,
                fontSize: 14, backgroundColor: '#1a1a1a', textColor: '#FFFFFF',
            } 
        }
    }
};

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// --- POWERSHELL PERSISTENTE (OPTIMIZACIÓN) ---
function initPowerShell() {
    if (psProcess) return;

    // Iniciamos un proceso de PowerShell que se queda esperando comandos
    psProcess = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', '-']);
    
    // Creamos el objeto WScript.Shell una sola vez en la memoria de ese proceso
    psProcess.stdin.write(`$wshell = New-Object -ComObject wscript.shell\n`);
    
    psProcess.on('exit', () => { psProcess = null; });
    psProcess.stderr.on('data', (data) => console.error(`PS Error: ${data}`));
    
    console.log("⚡ PowerShell Persistente Iniciado (Modo Baja Latencia)");
}

function sendKeyPress(key) {
    // 1. Seguridad: Si PowerShell murió o no existe, lo reiniciamos al vuelo
    if (!psProcess || psProcess.killed) {
        console.log("⚠️ PowerShell no responde, reiniciando motor...");
        initPowerShell();
        // Damos un pequeño respiro para que arranque antes de enviar el comando
        setTimeout(() => sendKeyPress(key), 100); 
        return;
    }

    const target = appState.profiles[appState.currentProfile].targetWindow;
    let cmd = "";

    // 2. Sanitización: Escapamos comillas simples para evitar errores de sintaxis en PowerShell
    // Si la ventana se llama "Don't Starve", esto lo convierte en "Don''t Starve" (sintaxis correcta de PS)
    const safeTarget = target ? target.replace(/'/g, "''") : "";

    if (safeTarget && safeTarget !== "Active Window") {
        // Intenta activar ventana específica. Si falla, no envía la tecla (evita escribir en el chat de OBS por error)
        cmd = `if($wshell.AppActivate('${safeTarget}')) { $wshell.SendKeys('${key}') }\n`;
    } else {
        // Envía a lo que sea que esté activo (Comportamiento por defecto)
        cmd = `$wshell.SendKeys('${key}')\n`;
    }

    try {
        psProcess.stdin.write(cmd);
    } catch (e) {
        console.error("❌ Error enviando tecla a PS:", e);
        // Si falla la escritura, matamos el proceso para que se reinicie limpio en el próximo intento
        try { psProcess.kill(); } catch(err) {}
        psProcess = null;
    }
}

// --- HELPERS ---
function sendToWindow(win, channel, data) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}
function sendLog(message) { sendToWindow(mainWindow, 'log-message', message); }

// --- STATS LOGIC ---
function updateUserStats(uniqueId, nickname, profileUrl, type, value = 1) {
    if (!sessionStats.users.has(uniqueId)) {
        sessionStats.users.set(uniqueId, {
            username: uniqueId, 
            nickname: nickname || uniqueId,
            profileUrl: profileUrl || null,
            likes: 0, coins: 0, chats: 0, maxCombo: 0
        });
    }
    const user = sessionStats.users.get(uniqueId);
    if(profileUrl) user.profileUrl = profileUrl;

    if (type === 'like') user.likes += parseInt(value);
    if (type === 'chat') user.chats += 1;
    if (type === 'coin') user.coins += value;
    if (type === 'combo') { if (value > user.maxCombo) user.maxCombo = value; }
}

setInterval(() => {
    if (statsWindow && !statsWindow.isDestroyed()) {
        const usersArray = Array.from(sessionStats.users.values());
        const topLikes = [...usersArray].sort((a,b) => b.likes - a.likes).slice(0, 10);
        const topCoins = [...usersArray].sort((a,b) => b.coins - a.coins).slice(0, 10);
        const topCombo = [...usersArray].sort((a,b) => b.maxCombo - a.maxCombo).slice(0, 5);
        
        const payload = { topLikes, topCoins, topCombo, biggestGift: sessionStats.biggestGift, totalUsers: usersArray.length };
        sendToWindow(statsWindow, 'stats-update', payload);
    }
}, 2000);

// --- VENTANAS ---
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100, height: 950, // Un poco más alto para los nuevos controles
        webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');
    mainWindow.webContents.on('did-finish-load', loadConfig);
    mainWindow.on('closed', () => {
        if (chatWindow && !chatWindow.isDestroyed()) chatWindow.close();
        if (statsWindow && !statsWindow.isDestroyed()) statsWindow.close();
        if (psProcess) psProcess.kill(); // Matar proceso al cerrar
        mainWindow = null; 
    });
}

function createChatWindow() {
    if (chatWindow && !chatWindow.isDestroyed()) { chatWindow.focus(); return; }
    const mainBounds = mainWindow ? mainWindow.getBounds() : { x:50, y:50 };
    chatWindow = new BrowserWindow({
        width: 400, height: 600, x: mainBounds.x + 1020, y: mainBounds.y,
        transparent: false, frame: true, backgroundColor: '#121212', autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
        title: "Feed TikTok"
    });
    chatWindow.loadFile('chat_window.html'); 
    chatWindow.webContents.on('did-finish-load', () => sendToWindow(chatWindow, 'active-profile-change', appState.profiles[appState.currentProfile].chatSettings));
}

function createStatsWindow() {
    if (statsWindow && !statsWindow.isDestroyed()) { statsWindow.focus(); return; }
    statsWindow = new BrowserWindow({
        width: 900, height: 600,
        webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') },
        title: "Panel de Estadísticas"
    });
    statsWindow.loadFile('stats_window.html'); 
}

app.whenReady().then(() => {
    createWindow();
    initPowerShell(); // Iniciar motor de teclas
});

// --- CONFIG ---
function loadConfig() {
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            const savedData = JSON.parse(fs.readFileSync(CONFIG_PATH));
            if(savedData.profiles) {
                Object.keys(savedData.profiles).forEach(pName => {
                    savedData.profiles[pName].chatSettings = savedData.profiles[pName].chatSettings 
                        ? { ...appState.profiles.Default.chatSettings, ...savedData.profiles[pName].chatSettings } 
                        : appState.profiles.Default.chatSettings;
                });
                appState = savedData;
            }
        } catch (e) { console.error("Error config", e); }
    }
    sendCurrentProfileData();
}

function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(appState, null, 2)); }

function sendCurrentProfileData() {
    const currentName = appState.currentProfile;
    if (!appState.profiles[currentName]) appState.currentProfile = Object.keys(appState.profiles)[0];
    const currentData = appState.profiles[appState.currentProfile];
    currentData.rules.forEach(rule => { if (rule.type === 'like') rule.counter = 0; });
    sendToWindow(mainWindow, 'profile-loaded', { name: appState.currentProfile, data: currentData });
    sendToWindow(mainWindow, 'profile-list', Object.keys(appState.profiles));
    sendToWindow(chatWindow, 'active-profile-change', currentData.chatSettings);
}

// --- IPC ---
// --- TESTEO DE REGLAS ---
ipcMain.on('test-rule', (e, index) => {
    const rules = appState.profiles[appState.currentProfile].rules;
    if (rules && rules[index]) {
        const rule = rules[index];
        sendLog(`🔧 TEST: Probando regla ${rule.type}...`);
        
        if (rule.actionType === 'audio') {
            sendToWindow(mainWindow, 'play-sound', rule.soundPath);
        } else {
            executeRuleSequence(rule);
        }
    }
});

ipcMain.on('create-profile', (e, name) => { 
    if (!appState.profiles[name]) {
        appState.profiles[name] = { username: "", targetWindow: "", rules: [], chatSettings: { ...appState.profiles.Default.chatSettings }};
        appState.currentProfile = name; saveConfig(); sendCurrentProfileData();
    }
});
ipcMain.on('switch-profile', (e, name) => {
    if (appState.profiles[name]) {
        appState.currentProfile = name;
        disconnectTikTok(); 
        processedGifts.clear();
        sessionStats.users.clear(); 
        saveConfig(); sendCurrentProfileData();
    }
});
ipcMain.on('delete-profile', (e, name) => { 
     if (Object.keys(appState.profiles).length <= 1) return;
     delete appState.profiles[name];
     if (appState.currentProfile === name) appState.currentProfile = Object.keys(appState.profiles)[0];
     saveConfig(); sendCurrentProfileData();
});
ipcMain.on('add-new-rule', (e, r) => { appState.profiles[appState.currentProfile].rules.push(r); saveConfig(); sendCurrentProfileData(); });
ipcMain.on('delete-rule', (e, i) => { appState.profiles[appState.currentProfile].rules.splice(i, 1); saveConfig(); sendCurrentProfileData(); });
ipcMain.on('set-target-window', (e, w) => { appState.profiles[appState.currentProfile].targetWindow = w; saveConfig(); });
ipcMain.on('update-chat-settings', (e, s) => { appState.profiles[appState.currentProfile].chatSettings = s; saveConfig(); sendToWindow(chatWindow, 'active-profile-change', s); });
// Usamos powershell también para obtener ventanas, pero este no necesita ser persistente
ipcMain.on('get-windows', () => { 
    const { exec } = require('child_process');
    exec(`powershell -c "Get-Process | Where-Object {$_.MainWindowTitle -ne \\"\\"} | Select-Object -ExpandProperty MainWindowTitle"`, (err, stdout) => {
        if(!err) sendToWindow(mainWindow, 'window-list', stdout.split('\r\n').filter(l=>l.trim()));
    });
});
ipcMain.on('open-chat-window', createChatWindow);
ipcMain.on('open-stats-window', createStatsWindow);

// --- TIKTOK CONNECT ---
function disconnectTikTok() {
    if(tiktokConnection) { try { tiktokConnection.disconnect(); } catch(e) {} tiktokConnection = null; }
    sendToWindow(mainWindow, 'connection-status', false);
    sendLog('⏹️ Desconectado.');
}

ipcMain.on('disconnect-tiktok', () => { disconnectTikTok(); });

ipcMain.on('connect-tiktok', (e, u) => {
    disconnectTikTok(); 
    processedGifts.clear();
    sessionStats.users.clear(); 
    appState.profiles[appState.currentProfile].username = u;
    saveConfig();

    sendLog(`⏳ Conectando a @${u}...`);
    tiktokConnection = new WebcastPushConnection(u);
    
    tiktokConnection.connect().then(s => {
        sendLog(`✅ CONECTADO a @${u}`);
        sendToWindow(mainWindow, 'connection-status', true); 
    }).catch(err => {
        sendLog(`❌ Error: ${err.message}`);
        sendToWindow(mainWindow, 'connection-status', false); 
    });

    tiktokConnection.on('roomUser', d => { if(d.viewerCount) {
         sendToWindow(mainWindow, 'log-message', `🔄 Viewers: ${d.viewerCount}`);
         sendToWindow(chatWindow, 'viewer-count-update', d.viewerCount);
    }});
    
    tiktokConnection.on('gift', d => {
        const uid = `${d.uniqueId}_${d.giftId}_${d.repeatCount}`;
        const now = Date.now();
        if(processedGifts.has(uid) && now - processedGifts.get(uid) < 2000) return;
        processedGifts.set(uid, now);

        const giftCost = (d.diamondCount * d.repeatCount) || 0;
        updateUserStats(d.uniqueId, d.nickname, d.profilePictureUrl, 'coin', giftCost);
        updateUserStats(d.uniqueId, d.nickname, d.profilePictureUrl, 'combo', d.repeatCount);

        if (giftCost > sessionStats.biggestGift.coins) {
            sessionStats.biggestGift = { username: d.uniqueId, giftName: d.giftName, coins: giftCost };
        }
        sendLog(`🎁 GIFT: ${d.giftName} (x${d.repeatCount})`);
        sendChatMessage(d.uniqueId, d.giftName, d.profilePictureUrl, 'gift'); 
        checkAndExecute('gift', d.giftName);
    });
    
    tiktokConnection.on('like', d => {
        updateUserStats(d.uniqueId, d.nickname, d.profilePictureUrl, 'like', d.likeCount); 
        checkAndExecute('like', d.likeCount);
    });
    
    tiktokConnection.on('chat', d => {
        updateUserStats(d.uniqueId, d.nickname, d.profilePictureUrl, 'chat');
        sendLog(`💬 ${d.uniqueId}: ${d.comment}`);
        sendChatMessage(d.uniqueId, d.comment, d.profilePictureUrl, 'chat'); 
        checkAndExecute('chat', d.comment);
    });

    tiktokConnection.on('social', d => {
        if(d.displayType.includes('follow')) { checkAndExecute('follow', 'X'); sendChatMessage(d.uniqueId, 'Follow!', d.profilePictureUrl, 'follow'); }
        if(d.displayType.includes('share')) { checkAndExecute('share', 'X'); sendChatMessage(d.uniqueId, 'Share!', d.profilePictureUrl, 'share'); }
    });
    tiktokConnection.on('subscribe', d => { checkAndExecute('subscribe', 'X'); sendChatMessage(d.uniqueId, 'Sub!', d.profilePictureUrl, 'subscribe'); });
    tiktokConnection.on('member', d => { updateUserStats(d.uniqueId, d.nickname, d.profilePictureUrl, 'join'); sendChatMessage(d.uniqueId, 'Joined', d.profilePictureUrl, 'join'); });
});

function sendChatMessage(username, message, profileUrl, type = 'chat', isRuleMatch = false) {
    if (!chatWindow || chatWindow.isDestroyed()) return;
    const settings = appState.profiles[appState.currentProfile].chatSettings;
    
    if (type === 'join' && !settings.showJoins) return;
    if (type === 'follow' && !settings.showFollows) return;
    if (type === 'share' && !settings.showShares) return;
    if (type === 'subscribe' && !settings.showSubscribes) return;
    if (type === 'gift' && !settings.showGifts) return;
    if (type === 'chest' && !settings.showChests) return;
    
    if (type === 'chat' || type === 'rule') {
        if (type === 'chat' && !settings.showUserChat) return;
        if (type === 'chat' && settings.showRulesMatches && !isRuleMatch) return; 
        if (type === 'chat' && settings.filterBots) {
            const botRegex = /bot|join|live|follow|welcome|entró|unió|compartió|suscrito/i;
            if (botRegex.test(message.toLowerCase())) return; 
        }
        if (type === 'chat' && settings.showMentions && !message.includes('@')) return;
    }
    sendToWindow(chatWindow, 'chat-message', { username, message, profileUrl, type, isRuleMatch });
}

// --- REGLAS CON COOLDOWN ---
function checkAndExecute(type, data) {
    const currentRules = appState.profiles[appState.currentProfile].rules;
    const now = Date.now();

    currentRules.forEach(rule => {
        // --- 1. LÓGICA DE COOLDOWN (Nuevo) ---
        if (rule.cooldown && rule.cooldown > 0) {
            if (rule.lastRun) {
                const secondsPassed = (now - rule.lastRun) / 1000;
                if (secondsPassed < rule.cooldown) {
                    // Aún en enfriamiento, ignoramos
                    return; 
                }
            }
        }
        // -------------------------------------

        let shouldFire = false;
        if (rule.type === 'like' && type === 'like') {
            rule.counter += parseInt(data);
            if (rule.counter >= parseInt(rule.value)) { shouldFire = true; rule.counter = 0; }
        } else if (rule.type === type) {
            if(['subscribe','follow','share'].includes(type)) shouldFire = true;
            else if(typeof data === 'string' && data.toLowerCase().includes(rule.value.toLowerCase())) shouldFire = true;
        }

        if (shouldFire) {
            // Actualizamos tiempo de ejecución
            rule.lastRun = now;

            sendChatMessage("BOT", `✅ Acción: ${rule.type}`, null, 'rule', true);
            if (rule.actionType === 'audio') sendToWindow(mainWindow, 'play-sound', rule.soundPath);
            else executeRuleSequence(rule);
        }
    });
}

function executeRuleSequence(rule) {
    const key = rule.key;
    const mode = rule.mode;
    if (mode === 'press') sendKeyPress(key);
    else if (mode === 'repeat') {
        const total = rule.count || 1;
        let current = 0;
        function loop() {
            if (current >= total) return;
            sendKeyPress(key); current++;
            if (current < total) setTimeout(loop, rule.interval || 100);
        }
        loop(); 
    }
}