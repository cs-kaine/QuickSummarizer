let hoverTimer;
let intentTimer;
let currentLink = null;
let isActive = false;
let currentRequest = null;
let requestInProgress = false;
let isPinned = false;
let currentSummaryData = null;
isActive = true;

const style = document.createElement('style');
style.innerHTML = `
    @keyframes qs-spin {
        to { transform: rotate(360deg); }
    }
    @keyframes qs-fadein {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes qs-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.45; }
    }
    @keyframes qs-shimmer {
        0%   { background-position: -400px 0; }
        100% { background-position:  400px 0; }
    }
    .qs-skeleton {
        background: linear-gradient(90deg, #1e2128 25%, #2b303d 50%, #1e2128 75%);
        background-size: 800px 100%;
        animation: qs-shimmer 1.4s ease-in-out infinite;
        border-radius: 5px;
    }
    .qs-loading-card {
        animation: qs-fadein 0.18s ease forwards;
    }
    #qs-popup {
        position: absolute;
        z-index: 2147483647;
        display: none;
        pointer-events: auto;
    }
    /* Critical fix: only the circle element carries the spin animation */
    .qs-spinner-circle {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 98, 0, 0.2);
        border-top-color: #ff6200;
        border-radius: 50%;
        animation: qs-spin 0.75s linear infinite;
        flex-shrink: 0;
        /* Explicitly isolated — display:block prevents any inline jank */
        display: block;
    }
    .qs-loading-text {
        color: #999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 500;
        animation: qs-pulse 1.5s ease-in-out infinite;
    }
    .qs-card {
        animation: qs-fadein 0.2s ease forwards;
    }
    .qs-icon-btn {
        position: relative;
    }
    .qs-icon-btn::after {
        content: attr(data-tip);
        position: absolute;
        bottom: calc(100% + 6px);
        right: 0;
        background: #1e2128;
        color: #d8dde8;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid #2e3340;
        pointer-events: none;
        opacity: 0;
        transform: translateY(3px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .qs-icon-btn:hover::after {
        opacity: 1;
        transform: translateY(0);
    }
    /* Subtle bottom progress bar as intent cue */
    #qs-intent-bar {
        position: fixed;
        bottom: 0;
        left: 0;
        height: 2px;
        background: linear-gradient(90deg, #ff6200, #ffaa5e);
        width: 0%;
        z-index: 2147483646;
        pointer-events: none;
        border-radius: 0 2px 2px 0;
    }
`;
document.head.appendChild(style);

// --- State sync ---
chrome.storage.sync.get(['isActive'], (result) => {
    isActive = result.isActive || false;
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.isActive) {
        isActive = changes.isActive.newValue;
        showToastNotification(isActive);
    }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_STATE') {
        isActive = message.isActive;
        showToastNotification(isActive);
        sendResponse({ success: true, isActive });
        return true;
    }
    if (message.type === 'PING') { sendResponse({ pong: true }); return false; }
    return false;
});

// --- DOM elements ---
const popup = document.createElement('div');
popup.id = 'qs-popup';
document.body.appendChild(popup);

const intentBar = document.createElement('div');
intentBar.id = 'qs-intent-bar';
document.body.appendChild(intentBar);

const HOVER_DELAY_MS = 1500;
const INTENT_CUE_MS  = 500;

function resetState() {
    if (isPinned) return; 
    clearTimeout(hoverTimer);
    clearTimeout(intentTimer);

    intentBar.style.transition = 'none';
    intentBar.style.width = '0%';
    if (currentRequest) { currentRequest.abort(); currentRequest = null; }
    requestInProgress = false;
    currentSummaryData = null;
    popup.style.display = 'none';
}

// --- Hover listeners ---
let lastMouseX = 0, lastMouseY = 0;

document.addEventListener('mousemove', (e) => {
    lastMouseX = e.pageX;
    lastMouseY = e.pageY;
    // Keep loading popup near cursor while waiting
    if (popup.style.display === 'block' && requestInProgress) {
        popup.style.left = `${e.pageX + 8}px`;
        popup.style.top  = `${e.pageY + 4}px`;
    }
});

document.addEventListener('mouseover', (e) => {
    if (!isActive) return;
    if (isPinned) return; 

    const link = e.target.closest('a');
    if (!link || !link.href.startsWith('http')) return;
    if (currentLink === link) return;

    if (currentLink !== null) resetState();
    currentLink = link;

    // After INTENT_CUE_MS, animate bar to signal "registered, keep hovering"
    intentTimer = setTimeout(() => {
        intentBar.style.transition = `width ${HOVER_DELAY_MS - INTENT_CUE_MS}ms linear`;
        intentBar.style.width = '100%';
    }, INTENT_CUE_MS);

    // After HOVER_DELAY_MS, fetch summary
    hoverTimer = setTimeout(async () => {
        if (requestInProgress) return;

        popup.style.left = `${lastMouseX + 8}px`;
        popup.style.top  = `${lastMouseY + 4}px`;
        popup.style.display = 'block';

        // Loading card — skeleton shimmer with cycling dynamic text
        const loadingPhrases = ['Reading the article…', 'Analyzing content…', 'Summarizing key points…', 'Almost done…'];
        let phraseIndex = 0;
        popup.innerHTML = `
            <div class="qs-loading-card" style="
                background: #0f1014;
                border: 1px solid #1e2128;
                border-radius: 14px;
                box-shadow: 0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,98,0,0.06), inset 0 1px 0 rgba(255,255,255,0.04);
                width: 340px;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
                <div style="background:linear-gradient(105deg,#c44a00 0%,#e86a20 100%);padding:9px 14px;display:flex;align-items:center;gap:8px;">
                    <div class="qs-skeleton" style="width:13px;height:13px;border-radius:3px;flex-shrink:0;"></div>
                    <div class="qs-skeleton" style="width:80px;height:10px;"></div>
                </div>
                <div style="padding:10px 15px 12px 15px;display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <div class="qs-skeleton" style="width:6px;height:6px;border-radius:50%;margin-top:6px;flex-shrink:0;"></div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                            <div class="qs-skeleton" style="height:11px;width:100%;"></div>
                            <div class="qs-skeleton" style="height:11px;width:75%;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <div class="qs-skeleton" style="width:6px;height:6px;border-radius:50%;margin-top:6px;flex-shrink:0;"></div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                            <div class="qs-skeleton" style="height:11px;width:100%;"></div>
                            <div class="qs-skeleton" style="height:11px;width:60%;"></div>
                        </div>
                    </div>
                    <div style="display:flex;gap:10px;align-items:flex-start;">
                        <div class="qs-skeleton" style="width:6px;height:6px;border-radius:50%;margin-top:6px;flex-shrink:0;"></div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:5px;">
                            <div class="qs-skeleton" style="height:11px;width:88%;"></div>
                            <div class="qs-skeleton" style="height:11px;width:50%;"></div>
                        </div>
                    </div>
                </div>
                <div style="background:#0a0b0e;border-top:1px solid #1a1d24;padding:10px 13px;display:flex;align-items:center;gap:8px;">
                    <div class="qs-spinner-circle" style="flex-shrink:0;"></div>
                    <span id="qs-loading-phrase" style="color:#666c7a;font-size:11.5px;font-weight:500;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;transition:opacity 0.3s ease;">Reading the article…</span>
                </div>
            </div>
        `;
        const phraseEl = document.getElementById('qs-loading-phrase');
        const phraseInterval = setInterval(() => {
            if (!phraseEl || !document.contains(phraseEl)) { clearInterval(phraseInterval); return; }
            if (phraseIndex >= loadingPhrases.length - 1) { clearInterval(phraseInterval); return; }
            phraseEl.style.opacity = '0';
            setTimeout(() => {
                phraseIndex += 1;
                phraseEl.textContent = loadingPhrases[phraseIndex];
                phraseEl.style.opacity = '1';
            }, 300);
        }, 1800);

        requestInProgress = true;
        const data = await getSummary(link.href);
        requestInProgress = false;
        clearInterval(phraseInterval);

        // Snap bar back
        intentBar.style.transition = 'none';
        intentBar.style.width = '0%';

        if (data && data.summary) {
            renderSummary(data);
        } else if (data && data.message) {
            popup.innerHTML = buildErrorCard(`⚠️ ${data.message}`);
        } else {
            popup.innerHTML = buildErrorCard('❌ Failed to load summary.');
        }
    }, HOVER_DELAY_MS);
});

document.addEventListener('mouseout', (e) => {
    if (isPinned) return; 

    const isLeavingLink = currentLink && !currentLink.contains(e.relatedTarget);
    const isLeavingPopup = popup && !popup.contains(e.relatedTarget);

    if (isLeavingLink && isLeavingPopup) {
        resetState();
        currentLink = null;
    }
});

// Prevent popup from closing when cursor moves within/out of it while unpinned
popup.addEventListener('mouseout', (e) => {
    if (isPinned) return; 

    const isLeavingPopup = popup && !popup.contains(e.relatedTarget);
    const isLeavingLink = currentLink && !currentLink.contains(e.relatedTarget);

    if (isLeavingPopup && isLeavingLink) {
        resetState();
        currentLink = null;
    }
});


function togglePin() {
    isPinned = !isPinned;
    const pinBtn = document.getElementById('qs-pin-btn');
    if (pinBtn) {
        if (isPinned) {
            pinBtn.style.background = 'rgba(255,255,255,0.2)';
            pinBtn.style.border = '1px solid rgba(255,255,255,0.4)';
            pinBtn.innerHTML = ICON_PIN_FILLED;
        } else {
            pinBtn.style.background = 'rgba(0,0,0,0.18)';
            pinBtn.style.border = '1px solid rgba(255,255,255,0.25)';
            pinBtn.innerHTML = ICON_PIN_OUTLINE;
            // Close popup when unpinned
            currentSummaryData = null;
            currentLink = null;
            popup.style.display = 'none';
        }
    }
}

// --- Icon constants (inline SVG — transparent background, no filter needed) ---
const ICON_PIN_OUTLINE = `<svg width="14" height="14" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 C4.13639336 1.59092052 7.23213248 4.60474918 10 8 C10 8.66 10 9.32 10 10 C9.2575 10.37125 8.515 10.7425 7.75 11.125 C3.9763558 13.69793923 2.75150195 16.88054568 1 21 C-2.76687864 21 -3.91190305 20.76462683 -7 19 C-7.928125 19.99 -7.928125 19.99 -8.875 21 C-11 23 -11 23 -13 23 C-11 19 -11 19 -9 15 C-9.99 14.01 -10.98 13.02 -12 12 C-11.02079402 9.55198504 -10.42031559 8.25218936 -8.125 6.875 C-6 6 -6 6 -3.875 5.125 C-1.57968441 3.74781064 -0.97920598 2.44801496 0 0 Z M1 4 C-0.5021094 5.18251166 -2.00291203 6.3733768 -3.40234375 7.67578125 C-5.1589183 9.13171957 -6.93324068 10.04920144 -9 11 C-8.07347299 12.17539996 -7.13336613 13.34010577 -6.1875 14.5 C-5.66542969 15.1496875 -5.14335937 15.799375 -4.60546875 16.46875 C-3.00795167 18.34509128 -3.00795167 18.34509128 0 18 C0.6496875 16.6078125 0.6496875 16.6078125 1.3125 15.1875 C2.72038627 12.52815927 3.76123556 10.91894095 6 9 C5.20882096 7.00016466 5.20882096 7.00016466 4 5 C3.01 4.67 2.02 4.34 1 4 Z" fill="rgba(255,255,255,0.85)" transform="translate(18,4)"/></svg>`;

const ICON_PIN_FILLED  = `<svg width="14" height="14" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M0 0 C3.2548802 0.58021778 4.93652408 1.52647141 7.25 3.875 C7.77078125 4.38804688 8.2915625 4.90109375 8.828125 5.4296875 C10 7 10 7 10 10 C9.236875 10.598125 8.47375 11.19625 7.6875 11.8125 C4.64924243 14.28550034 3.60867929 16.47622632 2 20 C1.34 20.66 0.68 21.32 0 22 C-1.875 21.625 -1.875 21.625 -4 21 C-7.87797662 20.56613908 -7.87797662 20.56613908 -9.75 22.5 C-10.1625 22.995 -10.575 23.49 -11 24 C-11.99 23.67 -12.98 23.34 -14 23 C-12 19 -12 19 -10 15 C-10.66 14.34 -11.32 13.68 -12 13 C-11.9375 11.0625 -11.9375 11.0625 -11 9 C-8.75 7.5 -8.75 7.5 -6 6 C-2.44768577 3.47024016 -2.44768577 3.47024016 0 0 Z" fill="#ffffff" transform="translate(18,4)"/></svg>`;

const ICON_COPY        = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

const ICON_SAVE_OUTLINE= `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

const ICON_SAVE_FILLED = `<svg width="15" height="15" viewBox="0 0 24 24" fill="#ffffff" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
function copyToClipboard() {
    if (!currentSummaryData) return;

    const summaryText = Array.isArray(currentSummaryData.summary)
        ? currentSummaryData.summary.join('\n• ')
        : currentSummaryData.summary;

    const fullText = `• ${summaryText}\n\nSentiment: ${currentSummaryData.sentiment || 'N/A'}\nCategory: ${currentSummaryData.category || 'N/A'}`;

    navigator.clipboard.writeText(fullText).then(() => {
        const copyBtn = document.getElementById('qs-copy-btn');
        if (copyBtn) {
            // Press animation: scale down then back
            copyBtn.style.transition = 'transform 0.1s ease';
            copyBtn.style.transform = 'scale(0.88)';
            setTimeout(() => {
                copyBtn.style.transform = 'scale(1)';
            }, 100);
        }
    }).catch(() => {
        alert('Failed to copy to clipboard');
    });
}

function setSaveBtnState(btn, saved) {
    if (saved) {
        btn.innerHTML = ICON_SAVE_FILLED;
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.border = '1px solid rgba(255,255,255,0.1)';
        btn.setAttribute('data-tip', 'Unsave');
    } else {
        btn.innerHTML = ICON_SAVE_OUTLINE;
        btn.style.background = 'rgba(255,255,255,0.06)';
        btn.style.border = '1px solid rgba(255,255,255,0.1)';
        btn.setAttribute('data-tip', 'Save for later');
    }
}

async function saveSummary() {

    console.log('SAVE CLICKED');

    if (!currentSummaryData || !currentLink) {
        console.log('Missing summary or link');
        return;
    }

    try {

        chrome.storage.local.get(['savedSummaries'], (result) => {

            const saved = result.savedSummaries || [];

            const newItem = {
                id: Date.now(),
                url: currentLink.href,
                title: (currentLink ? currentLink.textContent.trim() : '') || document.title,
                summary: currentSummaryData.summary,
                sentiment: currentSummaryData.sentiment || 'N/A',
                category: currentSummaryData.category || 'Other',
                savedAt: new Date().toISOString()
            };

            const alreadyExists = saved.some(
                item => item.url === newItem.url
            );

            if (!alreadyExists) {
                saved.unshift(newItem);

                chrome.storage.local.set({
                    savedSummaries: saved
                }, () => {

                    console.log('Saved successfully');

                    const saveBtn =
                        document.getElementById('qs-save-btn');

                    if (saveBtn) {
                        saveBtn.style.transition = 'transform 0.1s ease';
                        saveBtn.style.transform = 'scale(0.88)';
                        setTimeout(() => { saveBtn.style.transform = 'scale(1)'; }, 100);
                        setSaveBtnState(saveBtn, true);
                    }
                });

            } else {
                removeSavedSummary(newItem.url);
            }

        });

    } catch (err) {
        console.error(
            '[QuickSummarizer] Failed to save summary:',
            err
        );
    }
}

function removeSavedSummary(url) {

    chrome.storage.local.get(['savedSummaries'], (result) => {

        const saved = result.savedSummaries || [];

        const updated = saved.filter(item => item.url !== url);

        chrome.storage.local.set({
            savedSummaries: updated
        }, () => {

            console.log('Removed from saved');

            const saveBtn =
                document.getElementById('qs-save-btn');

            if (saveBtn) {
                saveBtn.style.transition = 'transform 0.1s ease';
                saveBtn.style.transform = 'scale(0.88)';
                setTimeout(() => { saveBtn.style.transform = 'scale(1)'; }, 100);
                setSaveBtnState(saveBtn, false);
            }

        });

    });

}

function saveForLater() {
    saveSummary();
}

function sentimentStyle(sentiment) {
    const s = (sentiment || '').toLowerCase();
    
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
    
    // Netral / Default (Abu-abu transparan)
    return { 
        bg: 'rgba(0, 0, 0, 0.2)', 
        border: 'rgba(255, 255, 255, 0.3)', 
        dot: '#ffffff', 
        text: 'rgba(255, 255, 255, 0.95)' 
    };
}

function renderSummary(data) {
    currentSummaryData = data;
    
    // Auto-save summary to local storage
    if (currentLink && currentLink.href) {
        saveToHistory(currentLink.href, data);
    }
    
    const ss = sentimentStyle(data.sentiment);
    
    // Use the hovered link's own text as the title — matches the article headline
    const pageTitle = (currentLink ? currentLink.textContent.trim() : '') || document.title || 'Summary';

    const bullets = Array.isArray(data.summary)
        ? data.summary.map((s, i) => `
            <li style="
                display: flex;
                gap: 10px;
                align-items: flex-start;
                padding: 10px 0;
                ${i < data.summary.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.045);' : ''}
                list-style: none;
            ">
                <span style="
                    color: #d8dde8;
                    margin-top: 2px;
                    flex-shrink: 0;
                    font-size: 16px;
                    opacity: 0.8;
                    font-weight: 500;
                ">→</span>
                <span style="
                    color: #d8dde8;
                    font-size: 13px;
                    line-height: 1.6;
                    font-weight: 400;
                ">${s}</span>
            </li>`).join('')
        : `<li style="color:#d8dde8; font-size:13px; list-style:none;">→ ${data.summary}</li>`;

    popup.innerHTML = `
        <div class="qs-card" style="
            background: #0f1014;
            border: 1px solid #1e2128;
            border-radius: 14px;
            box-shadow:
                0 24px 64px rgba(0,0,0,0.75),
                0 0 0 1px rgba(255,98,0,0.06),
                inset 0 1px 0 rgba(255,255,255,0.04);
            width: 380px;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
            <div style="
                background: linear-gradient(135deg, #ff6b35 0%, #f97a1c 100%);
                padding: 16px;
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
            ">
                <div style="flex: 1; display: flex; flex-direction: column; gap: 10px;">
                    <div style="
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        background: ${ss.bg};
                        border: 1px solid ${ss.border};
                        padding: 3px 10px;
                        border-radius: 20px;
                        width: fit-content;
                    ">
                        <span style="
                            width: 6px; height: 6px;
                            border-radius: 50%;
                            background: ${ss.dot};
                            display: inline-block;
                            flex-shrink: 0;
                        "></span>
                        <span style="color: ${ss.text}; font-size: 11px; font-weight: 600;">${data.sentiment || 'N/A'}</span>
                    </div>
                    
                    <h3 style="
                        color: white;
                        font-size: 16px;
                        font-weight: 700;
                        margin: 0;
                        line-height: 1.4;
                        word-wrap: break-word;
                    ">${pageTitle}</h3>
                    
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <span style="
                            color: white;
                            font-size: 11px;
                            font-weight: 600;
                            background: rgba(255,255,255,0.15);
                            padding: 4px 10px;
                            border-radius: 20px;
                        ">${data.category || 'Other'}</span>
                    </div>
                </div>
                
                <button id="qs-pin-btn" style="
                    background: rgba(0,0,0,0.18);
                    border: 1px solid rgba(255,255,255,0.25);
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                    padding: 0;
                    flex-shrink: 0;
                "></button>
            </div>

            <div style="padding: 12px 16px;">
                <ul style="margin: 0; padding: 0;">
                    ${bullets}
                </ul>
            </div>

            <div style="
                background: #0a0b0e;
                border-top: 1px solid #1a1d24;
                padding: 12px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            ">
                <button id="qs-copy-btn" class="qs-icon-btn" data-tip="Copy" style="
                    flex: 1;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 10px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                "></button>

                <button id="qs-save-btn" class="qs-icon-btn" data-tip="Save for later" style="
                    flex: 1;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 10px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                "></button>
            </div>
        </div>
    `;

    // Attach event listeners and set initial icon states
    setTimeout(async () => {
        const pinBtn  = document.getElementById('qs-pin-btn');
        const copyBtn = document.getElementById('qs-copy-btn');
        const saveBtn = document.getElementById('qs-save-btn');

        if (pinBtn) {
            pinBtn.innerHTML = ICON_PIN_OUTLINE;
            pinBtn.addEventListener('click', togglePin);
        }
        if (copyBtn) {
            copyBtn.innerHTML = ICON_COPY;
            copyBtn.addEventListener('click', copyToClipboard);
        }
        if (saveBtn) {
            saveBtn.addEventListener('click', saveForLater);
            const url = currentLink ? currentLink.href : window.location.href;
            chrome.storage.local.get(['savedSummaries'], (result) => {
                const isSaved = (result.savedSummaries || []).some(item => item.url === url);
                setSaveBtnState(saveBtn, isSaved);
            });
        }
    }, 0);
}

function buildErrorCard(msg) {
    return `
        <div style="
            background: #110e0e;
            border: 1px solid #2a1818;
            border-radius: 11px;
            padding: 13px 16px;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 10px 36px rgba(0,0,0,0.55);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13px;
            color: #ff9a9a;
            width: 270px;
            line-height: 1.5;
        ">
            ${msg}
        </div>
    `;
}

// --- API call ---
async function getSummary(url) {
    const endpoint = 'http://localhost:3000/api/summarize';
    try {
        const controller = new AbortController();
        currentRequest = controller;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
            signal: controller.signal
        });
        const data = await response.json();
        currentRequest = null;
        return data;
    } catch (err) {
        currentRequest = null;
        if (err.name === 'AbortError') return null;
        return null;
    }
}

// --- Local history helpers ---
function saveToHistory(url, summaryData) {
    const historyEntry = {
        id: Date.now(),
        url,
        title: document.title || url,
        summary: summaryData.summary,
        sentiment: summaryData.sentiment || 'N/A',
        category: summaryData.category || 'Other',
        timestamp: new Date().toISOString(),
        saved: false
    };

    chrome.storage.local.get(['summaryHistory'], (result) => {
        const history = result.summaryHistory || [];
        const index = history.findIndex(item => item.url === url);

        if (index > -1) {
            history[index] = { ...history[index], ...historyEntry };
        } else {
            history.unshift(historyEntry);
        }

        if (history.length > 100) {
            history.splice(100);
        }

        chrome.storage.local.set({ summaryHistory: history });
    });
}

function markAsSaved(url) {
    chrome.storage.local.get(['summaryHistory'], (result) => {
        const history = result.summaryHistory || [];
        const item = history.find(entry => entry.url === url);
        if (!item) return;

        item.saved = true;
        chrome.storage.local.set({ summaryHistory: history });
    });
}

// --- Toast notification ---
function showToastNotification(isNowActive) {
    const existing = document.getElementById('qs-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'qs-toast';
    toast.innerText = isNowActive ? '🚀 QuickSummarizer: ON' : '💤 QuickSummarizer: OFF';

    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: isNowActive ? '#ff6200' : '#1e2028',
        color: 'white',
        padding: '11px 22px',
        borderRadius: '10px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        zIndex: '2147483647',
        boxShadow: isNowActive
            ? '0 6px 24px rgba(255,98,0,0.45)'
            : '0 6px 24px rgba(0,0,0,0.5)',
        border: isNowActive ? '1px solid rgba(255,255,255,0.12)' : '1px solid #2a2f3a',
        transition: 'opacity 0.25s ease',
        opacity: '0',
        letterSpacing: '0.3px'
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}