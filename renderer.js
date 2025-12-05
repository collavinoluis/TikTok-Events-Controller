// --- REFERENCIAS ---
const eventType = document.getElementById('eventType');
const eventValue = document.getElementById('eventValue');
const actionTypeSelect = document.getElementById('actionTypeSelect');
const keyOptions = document.getElementById('keyOptions');
const audioOptions = document.getElementById('audioOptions');
const repeatOptions = document.getElementById('repeatOptions');
const audioFileInput = document.getElementById('audioFileInput');
const audioFileLabel = document.getElementById('audioFileLabel');
const keySelect = document.getElementById('keySelect');
const customKeyInput = document.getElementById('customKeyInput');
const actionMode = document.getElementById('actionMode');
const modalOverlay = document.getElementById('modalOverlay');
const newProfileName = document.getElementById('newProfileName');
const windowSelect = document.getElementById('windowSelect'); 
const logFeed = document.getElementById('logFeed');
const profileSelect = document.getElementById('profileSelect');
const usernameInput = document.getElementById('usernameInput');
const btnOpenChatWindow = document.getElementById('btnOpenChatWindow');
const btnOpenStatsWindow = document.getElementById('btnOpenStatsWindow');
const btnConnect = document.getElementById('btnConnect');

const settingFontSize = document.getElementById('settingFontSize');
const fontSizeDisplay = document.getElementById('fontSizeDisplay');

// Referencias de Volumen (NUEVO)
const volSlider = document.getElementById('settingMasterVolume');
const volDisp = document.getElementById('volDisplay');

// Ayuda Refs
const btnHelp = document.getElementById('btnHelp');
const modalHelp = document.getElementById('modalHelp');
const btnCloseHelp = document.getElementById('btnCloseHelp');

let currentRules = [];
let selectedSoundPath = "";
let savedTargetWindow = "Active Window";
let isConnected = false;

// --- CONFIG CHAT ---
const chatSettingsChecks = [
    { id: 'settingShowUserChat', key: 'showUserChat' },
    { id: 'settingShowRulesMatches', key: 'showRulesMatches' },
    { id: 'settingShowGifts', key: 'showGifts' },
    { id: 'settingShowFollows', key: 'showFollows' },
    { id: 'settingShowShares', key: 'showShares' },
    { id: 'settingShowChests', key: 'showChests' },
    { id: 'settingShowJoins', key: 'showJoins' },
    { id: 'settingShowSubscribes', key: 'showSubscribes' },
    { id: 'settingFilterBots', key: 'filterBots' },
    { id: 'settingFontSize', key: 'fontSize', type: 'number' },
    { id: 'settingBackgroundColor', key: 'backgroundColor', type: 'color' },
    { id: 'settingTextColor', key: 'textColor', type: 'color' }
];

function addLog(m) { 
    const d = document.createElement('div'); d.textContent = `> ${m}`; logFeed.prepend(d); 
}

if(settingFontSize) {
    settingFontSize.addEventListener('input', (e) => { fontSizeDisplay.textContent = e.target.value + "px"; });
}

// --- LÓGICA DE VOLUMEN (NUEVO) ---
if(volSlider) {
    // 1. Al mover el slider, actualizamos texto y guardamos en memoria
    volSlider.addEventListener('input', (e) => { 
        volDisp.textContent = e.target.value + "%"; 
        localStorage.setItem('sn_volume', e.target.value);
    });
    
    // 2. Al iniciar, recuperamos el volumen guardado
    const savedVol = localStorage.getItem('sn_volume');
    if(savedVol) { 
        volSlider.value = savedVol; 
        volDisp.textContent = savedVol + "%"; 
    }
}

// --- AYUDA MODAL ---
if (btnHelp && modalHelp && btnCloseHelp) {
    btnHelp.addEventListener('click', () => { modalHelp.classList.remove('hidden'); });
    btnCloseHelp.addEventListener('click', () => { modalHelp.classList.add('hidden'); });
    modalHelp.addEventListener('click', (e) => { if (e.target === modalHelp) modalHelp.classList.add('hidden'); });
}

// --- CONEXIÓN ---
btnConnect.addEventListener('click', () => {
    if (isConnected) {
        window.api.disconnect();
    } else {
        const u = usernameInput.value; 
        if(u) {
            window.api.connect(u);
            btnConnect.textContent = "⏳...";
            btnConnect.disabled = true;
        } else {
            alert("Escribe un usuario");
        }
    }
});

window.api.onConnectionStatus((status) => {
    isConnected = status;
    btnConnect.disabled = false;
    if (isConnected) {
        btnConnect.textContent = "🟢 DESCONECTAR";
        btnConnect.style.background = "#2ecc71";
    } else {
        btnConnect.textContent = "🔴 CONECTAR";
        btnConnect.style.background = "#ef4444";
    }
});

// --- UI GENERAL ---
function populateWindowSelect(list) {
    const s = windowSelect;
    s.innerHTML = '<option value="Active Window">-- Ventana Activa --</option>';
    if (list.length === 0) { s.value = 'Active Window'; return; }
    list.forEach(w => {
        const opt = document.createElement('option'); opt.value = w; opt.innerText = w; s.appendChild(opt);
    });
    if (savedTargetWindow) {
        const options = Array.from(s.options);
        const found = options.find(opt => opt.value === savedTargetWindow);
        if (found) s.value = savedTargetWindow;
        else if (savedTargetWindow !== 'Active Window') {
             const opt = document.createElement('option'); opt.value = savedTargetWindow; opt.innerText = `${savedTargetWindow} (Guardada)`; s.appendChild(opt); s.value = savedTargetWindow;
        }
    }
}

function renderList() {
    const list = document.getElementById('rulesList'); 
    list.innerHTML = '';
    currentRules.forEach((r, i) => {
        const li = document.createElement('li'); li.className = 'rule-item';
        
        let desc = r.actionType === 'audio' ? `🔊 ${r.soundName}` : `⌨️ ${r.key}`;
        let extraInfo = "";
        if(r.cooldown && r.cooldown > 0) extraInfo = ` <span style="color:#fbbf24; font-size:10px; margin-left:5px;">(🕒 ${r.cooldown}s)</span>`;
        let eventDisplay = r.type.toUpperCase();

        // --- INTERFAZ ACTUALIZADA CON BOTÓN PLAY ---
        li.innerHTML = `
            <div style="flex:1;">
                <b class="text-accent">${eventDisplay}</b> ${r.value || ''} ➡ ${desc} ${extraInfo}
            </div>
            <div style="display:flex; gap:5px;">
                <button onclick="testRule(${i})" title="Probar Regla" style="background:rgba(255,255,255,0.1); border:none; cursor:pointer; padding:5px 8px; border-radius:4px;">▶️</button>
                <button onclick="deleteRule(${i})" style="background:none; border:none; cursor:pointer; opacity:0.6;">❌</button>
            </div>
        `;
        list.appendChild(li);
    });
}

function updateChatSettingsUI(data) {
    const settings = data.data.chatSettings;
    if (settings) {
        chatSettingsChecks.forEach(item => {
            const element = document.getElementById(item.id);
            if (element) {
                if (item.type === 'number') {
                    element.value = settings[item.key];
                    if(item.id === 'settingFontSize') fontSizeDisplay.textContent = settings[item.key] + "px";
                }
                else if (item.type === 'color') element.value = settings[item.key];
                else element.checked = settings[item.key] || false; 
            }
        });
    }
}

// IPC Listeners
window.api.onLog(addLog);

// --- SISTEMA DE COLA DE AUDIO (Audio Queue) ---
let audioQueue = [];
let isPlayingAudio = false;

function processAudioQueue() {
    // Si ya está sonando algo o la cola está vacía, no hacemos nada
    if (isPlayingAudio || audioQueue.length === 0) return;

    isPlayingAudio = true;
    const soundPath = audioQueue.shift(); // Sacamos el primer sonido de la fila

    const audio = new Audio(soundPath);
    
    // --- APLICAMOS EL VOLUMEN ---
    const volInput = document.getElementById('settingMasterVolume');
    const volValue = volInput ? parseInt(volInput.value) : 50;
    audio.volume = volValue / 100; // Convierte 50 a 0.5
    // ----------------------------

    // Cuando el audio termina, marcamos libre y llamamos al siguiente
    audio.onended = () => {
        isPlayingAudio = false;
        processAudioQueue(); 
    };

    // Si el archivo de audio falla (borrado o movido), no trabamos la cola
    audio.onerror = () => {
        addLog(`❌ Error Audio: No se pudo reproducir`);
        isPlayingAudio = false;
        processAudioQueue(); 
    };

    // Intentar reproducir
    audio.play().catch(e => {
        console.error("Error play:", e);
        isPlayingAudio = false;
        processAudioQueue();
    });
}

// Listener para sonidos
window.api.onPlaySound((filePath) => {
    audioQueue.push(filePath); // Añadimos a la fila
    processAudioQueue();       // Intentamos procesar
});

window.api.onWindowList(populateWindowSelect);
window.api.onProfileList((list) => {
    const select = document.getElementById('profileSelect');
    const current = select.value;
    select.innerHTML = '';
    list.forEach(name => {
        const opt = document.createElement('option'); opt.value = name; opt.innerText = name; select.appendChild(opt);
    });
    if(list.includes(current)) select.value = current;
    else if(list.length > 0) select.value = list[0];
});

window.api.onProfileLoaded((payload) => {
    const { name, data } = payload;
    document.getElementById('profileSelect').value = name;
    document.getElementById('usernameInput').value = data.username || "";
    currentRules = data.rules || [];
    renderList();
    savedTargetWindow = data.targetWindow || 'Active Window';
    windowSelect.value = savedTargetWindow; 
    if (windowSelect.options.length > 1) populateWindowSelect(Array.from(windowSelect.options).map(o => o.value).filter(v => v !== 'Active Window' && v.indexOf('(Guardada)') === -1));
    updateChatSettingsUI(payload); 
    addLog(`Perfil Cargado: ${name}`);
});

// Event Listeners
btnOpenChatWindow.addEventListener('click', () => { window.api.openChatWindow(); });
if(btnOpenStatsWindow) btnOpenStatsWindow.addEventListener('click', () => { window.api.openStatsWindow(); });

document.getElementById('btnNewProfile').addEventListener('click', () => { modalOverlay.classList.remove('hidden'); newProfileName.value = ""; newProfileName.focus(); });
document.getElementById('btnCancelModal').addEventListener('click', () => { modalOverlay.classList.add('hidden'); });
document.getElementById('btnConfirmModal').addEventListener('click', () => {
    const name = newProfileName.value;
    if(name && name.trim().length > 0) { window.api.createProfile(name.trim()); modalOverlay.classList.add('hidden'); }
});
document.getElementById('profileSelect').addEventListener('change', (e) => { window.api.switchProfile(e.target.value); });
document.getElementById('btnDeleteProfile').addEventListener('click', () => {
    const current = document.getElementById('profileSelect').value;
    if(confirm("¿Borrar " + current + "?")) window.api.deleteProfile(current);
});
document.getElementById('btnRefreshWindows').addEventListener('click', () => { windowSelect.innerHTML = '<option>...</option>'; window.api.getWindows(); });
windowSelect.addEventListener('change', (e) => window.api.setTargetWindow(e.target.value));

// Reglas UI
eventType.addEventListener('change', () => {
    const type = eventType.value;
    eventValue.value = "";
    eventValue.style.display = "block";
    if(type === 'gift') { eventValue.setAttribute('list', 'giftsDataList'); eventValue.placeholder = "Nombre (Ej: Rose)"; } 
    else if(type === 'like') { eventValue.removeAttribute('list'); eventValue.placeholder = "Cantidad (Ej: 100)"; } 
    else if(['subscribe','follow','share'].includes(type)) { eventValue.style.display = "none"; eventValue.value = "X"; } 
    else { eventValue.removeAttribute('list'); eventValue.placeholder = "Comando (Ej: !saltar)"; }
});
actionTypeSelect.addEventListener('change', () => {
    const isKey = actionTypeSelect.value === 'key';
    keyOptions.classList.toggle('hidden', !isKey); 
    audioOptions.classList.toggle('hidden', isKey);
    repeatOptions.classList.toggle('hidden', !(isKey && actionMode.value === 'repeat'));
});
actionMode.addEventListener('change', (e) => { repeatOptions.classList.toggle('hidden', !(e.target.value === 'repeat' && actionTypeSelect.value === 'key')); });
audioFileInput.addEventListener('change', (e) => {
    if(e.target.files[0]) { selectedSoundPath = e.target.files[0].path; audioFileLabel.innerText = "🎵 " + e.target.files[0].name; }
});
keySelect.addEventListener('change', () => { customKeyInput.classList.toggle('hidden', keySelect.value !== 'CUSTOM'); if(keySelect.value === 'CUSTOM') customKeyInput.focus(); });
customKeyInput.addEventListener('keydown', (e) => { e.preventDefault(); let k = e.key; if(k.length>1 && k !== ' ') k=`{${k.toUpperCase()}}`; else k=k.toLowerCase(); customKeyInput.value=k; customKeyInput.blur(); });

document.getElementById('btnAddRule').addEventListener('click', () => {
    const actionType = actionTypeSelect.value;
    const type = eventType.value;
    const value = eventValue.value;
    
    // --- LECTURA COOLDOWN ---
    const cdInput = document.getElementById('ruleCooldown');
    const cooldown = cdInput.value ? parseInt(cdInput.value) : 0;
    // ------------------------

    if(!value) return alert("Falta valor");
    
    let rule = { type, value, actionType, cooldown };
    
    if(actionType === 'key') {
        let key = keySelect.value === 'CUSTOM' ? customKeyInput.value : keySelect.value;
        if(!key) return alert("Falta tecla");
        rule.key = key; rule.mode = actionMode.value;
        if(rule.mode === 'repeat') {
            rule.count = parseInt(document.getElementById('repeatCount').value);
            const unit = document.getElementById('repeatUnit').value;
            let interval = parseInt(document.getElementById('repeatInterval').value);
            if(unit === 's') interval *= 1000;
            rule.interval = interval;
        }
    } else { 
        if(!selectedSoundPath) return alert("Elige sonido");
        rule.soundPath = selectedSoundPath; rule.soundName = audioFileLabel.innerText.replace('🎵 ', '');
    }
    window.api.addRule(rule);
});

// FUNCIONES GLOBALES (Botones de lista)
window.deleteRule = (i) => { window.api.deleteRule(i); };

// Función nueva para testear reglas
window.testRule = (i) => { 
    addLog(`🔧 Testeando Regla #${i+1}...`);
    window.api.testRule(i); 
};

document.getElementById('btnSaveChatSettings').addEventListener('click', () => {
    const newSettings = {};
    chatSettingsChecks.forEach(item => {
        const element = document.getElementById(item.id);
        if (element) {
            if (item.type === 'number') newSettings[item.key] = parseInt(element.value);
            else if (item.type === 'color') newSettings[item.key] = element.value;
            else newSettings[item.key] = element.checked;
        }
    });
    window.api.updateChatSettings(newSettings);
    const btn = document.getElementById('btnSaveChatSettings');
    const prevText = btn.textContent;
    btn.textContent = "✅ Guardado";
    setTimeout(() => btn.textContent = prevText, 1000);
});

const popularGifts = ["Rose", "TikTok", "Finger Heart", "Panda", "Galaxy", "Lion", "GG", "Money Gun", "Corgi", "Hat"];
const dl = document.getElementById('giftsDataList');
popularGifts.forEach(g => { const o = document.createElement('option'); o.value=g; dl.appendChild(o); });
window.api.getWindows(); 
actionTypeSelect.dispatchEvent(new Event('change')); eventType.dispatchEvent(new Event('change'));