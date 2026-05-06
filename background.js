// filepath: background.js
console.log('[Background] Service worker starting...');

// Verify commands are registered
chrome.commands.getAll((commands) => {
    console.log('[Background] Registered commands:', commands);
});

chrome.commands.onCommand.addListener((command) => {
    console.log('[Background] Command triggered:', command);
    
    if (command === 'toggle-extension') {
        chrome.storage.sync.get(['isActive'], (result) => {
            const newState = !result.isActive;
            
            chrome.storage.sync.set({ isActive: newState }, () => {
                console.log('[Background] State saved to sync:', newState);
                
                // Send to all HTTP tabs
                chrome.tabs.query({}, (tabs) => {
                    console.log('[Background] Found', tabs.length, 'tabs');
                    
                    tabs.forEach(tab => {
                        // Only try HTTP/HTTPS tabs
                        if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
                            try {
                                chrome.tabs.sendMessage(tab.id, { 
                                    type: 'TOGGLE_STATE', 
                                    isActive: newState 
                                }, (response) => {
                                    // Check if message was delivered (not if responded)
                                    const error = chrome.runtime.lastError;
                                    if (error) {
                                        console.log('[Background] Tab', tab.id, 'error:', error.message);
                                    } else {
                                        console.log('[Background] ✅ Message delivered to tab:', tab.id, tab.url);
                                    }
                                });
                            } catch (e) {
                                console.log('[Background] Exception for tab', tab.id, e.message);
                            }
                        }
                    });
                });
            });
        });
    }
});