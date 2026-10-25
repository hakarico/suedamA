chrome.action.onClicked.addListener(async tab => {
  if (tab.id && tab.url?.startsWith('https://chat.deepseek.com/')) {
    try { await chrome.tabs.sendMessage(tab.id, {type: 'suedama:toggle'}); }
    catch { /* Existing tabs need a reload after installation/update. */ }
  }
});
