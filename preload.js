const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    testRule: (index) => ipcRenderer.send('test-rule', index),
    connect: (username) => ipcRenderer.send('connect-tiktok', username),
    disconnect: () => ipcRenderer.send('disconnect-tiktok'),
    onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (event, status) => callback(status)),

    addRule: (rule) => ipcRenderer.send('add-new-rule', rule),
    deleteRule: (index) => ipcRenderer.send('delete-rule', index),
    
    createProfile: (name) => ipcRenderer.send('create-profile', name),
    switchProfile: (name) => ipcRenderer.send('switch-profile', name),
    deleteProfile: (name) => ipcRenderer.send('delete-profile', name),
    
    getWindows: () => ipcRenderer.send('get-windows'),
    setTargetWindow: (windowName) => ipcRenderer.send('set-target-window', windowName),
    
    onWindowList: (callback) => ipcRenderer.on('window-list', (event, list) => callback(list)),
    onLog: (callback) => ipcRenderer.on('log-message', (event, message) => callback(message)),
    onPlaySound: (callback) => ipcRenderer.on('play-sound', (event, filePath) => callback(filePath)),
    
    onProfileLoaded: (callback) => ipcRenderer.on('profile-loaded', (event, data) => callback(data)),
    onProfileList: (callback) => ipcRenderer.on('profile-list', (event, list) => callback(list)),
    
    onChatMessage: (callback) => ipcRenderer.on('chat-message', (event, data) => callback(data)),
    updateChatSettings: (settings) => ipcRenderer.send('update-chat-settings', settings),
    openChatWindow: () => ipcRenderer.send('open-chat-window'),
    openStatsWindow: () => ipcRenderer.send('open-stats-window'),

    onViewerCountUpdate: (callback) => ipcRenderer.on('viewer-count-update', (event, count) => callback(count)),
    onActiveProfileChange: (callback) => ipcRenderer.on('active-profile-change', (event, data) => callback(data)),
    onStatsUpdate: (callback) => ipcRenderer.on('stats-update', (event, data) => callback(data)),
});