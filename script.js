const MODEL = "gemini-3-flash-preview";
let hoverTimer;

// Popup element
const popup = document.createElement('div');
popup.id = 'link-lens-popup'; 
document.body.appendChild(popup);

// Hover
document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a');
    if (!link || !link.href.startsWith('http')) return;

    // Position it near mouse
    popup.style.left = `${e.pageX + 15}px`;
    popup.style.top = `${e.pageY + 15}px`;

    hoverTimer = setTimeout(async () => {
        popup.style.display = 'block';
    
        popup.innerHTML = '<div class="spinner"></div>';

        const summary = await getSummary(link.href);
    
        popup.innerText = summary; 
    }, 500);
});

document.addEventListener('mouseout', () => {
    clearTimeout(hoverTimer);
    popup.style.display = 'none';
});

// API Func
async function getSummary(url) {
    const result = await chrome.storage.local.get(['gemini_key']);
    const apiKey = result.gemini_key;

    if (!apiKey) {
        return "Error: No API Key found. Click the extension icon to set it.";
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `Summarize this link in one short paragraph (<50 words). Focus on the point of the article instead of a shallow overview! ${url}` }] }]
            })
        });

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (err) {
        return "Error: Could not reach LLM. Check your key.";
    }
}