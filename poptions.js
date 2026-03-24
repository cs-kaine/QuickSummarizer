document.getElementById('saveBtn').addEventListener('click', () => {
    const key = document.getElementById('apiKey').value;
  
    if (key) {
        chrome.storage.local.set({ gemini_key: key }, () => {
            document.getElementById('status').innerText = "Key saved successfully!";
        });
    }
});

// Load key if one is stored
chrome.storage.local.get(['gemini_key'], (result) => {
    if (result.gemini_key) {
        document.getElementById('apiKey').value = result.gemini_key;
    }
});