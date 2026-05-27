document.addEventListener('DOMContentLoaded', () => {
    loadSavedSummaries();
});

// --- Helper to determine dynamic sentiment colors ---
function sentimentStyle(sentiment) {
    const s = (sentiment || '').toLowerCase();
    
    // Custom design for contrast & readability
    if (s === 'positif' || s === 'positive') {
        return { 
            bg: 'rgba(6, 78, 59, 0.75)', 
            border: 'rgba(52, 211, 153, 0.4)', 
            dot: '#4ade80', 
            text: '#ffffff' 
        };
    }
    if (s === 'negatif' || s === 'negative') {
        return { 
            bg: 'rgba(127, 29, 29, 0.75)', 
            border: 'rgba(248, 113, 113, 0.4)', 
            dot: '#ff6b6b', 
            text: '#ffffff' 
        };
    }
    
    // Neutral / Default
    return { 
        bg: 'rgba(255, 255, 255, 0.05)', 
        border: 'rgba(255, 255, 255, 0.1)', 
        dot: '#ffffff', 
        text: 'rgba(255, 255, 255, 0.8)' 
    };
}

function loadSavedSummaries() {
    const container = document.getElementById('saved-list');
    if (!container) return;

    chrome.storage.local.get(['savedSummaries'], (result) => {
        const saved = result.savedSummaries || [];

        if (saved.length === 0) {
            container.innerHTML = `<div class="empty-state">No saved summaries yet.</div>`;
            return;
        }

        container.innerHTML = saved.map(item => {
            // Retrieve dynamic styles for this specific item
            const ss = sentimentStyle(item.sentiment);
            
            // Join array into a single paragraph if multiple bullets exist
            const summaryText = Array.isArray(item.summary) 
                ? item.summary.join(' ') 
                : item.summary;

            return `
                <div class="saved-item">
                    <button class="remove-btn" data-id="${item.id}" title="Remove">✕</button>
                    
                    <div class="saved-title">
                        <a href="${item.url}" target="_blank" style="color: inherit; text-decoration: none;">
                            ${item.title || item.url}
                        </a>
                    </div>
                    
                    <div class="saved-summary">${summaryText}</div>
                    
                    <div class="saved-meta">
                        <div style="
                            display: inline-flex; 
                            align-items: center; 
                            gap: 5px; 
                            background: ${ss.bg}; 
                            border: 1px solid ${ss.border}; 
                            padding: 2px 8px; 
                            border-radius: 20px;
                        ">
                            <span style="
                                width: 5px; height: 5px; 
                                border-radius: 50%; 
                                background: ${ss.dot}; 
                                display: inline-block;
                            "></span>
                            <span style="color: ${ss.text}; font-size: 9.5px; font-weight: 600;">
                                ${item.sentiment || 'N/A'}
                            </span>
                        </div>
                        
                        <div class="saved-chip">${item.category || 'N/A'}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Attach event listeners to all newly rendered remove buttons
        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                removeSavedSummary(Number(btn.dataset.id));
            });
        });
    });
}

function removeSavedSummary(id) {
    chrome.storage.local.get(['savedSummaries'], (result) => {
        const saved = result.savedSummaries || [];
        const updated = saved.filter(item => item.id !== id);
        
        chrome.storage.local.set({ savedSummaries: updated }, () => {
            loadSavedSummaries();
        });
    });
}