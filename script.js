let hoverTimer;
let intentTimer;
let currentLink = null;
let isActive = false;
let currentRequest = null;
let requestInProgress = false;
let isPinned = false;
let currentSummaryData = null;
isActive = true;

// Inject global styles once — ONLY .qs-spinner-circle animates, not its parent or siblings
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

// --- Hover delay config ---
// 1500ms: intentional but snappy; filters casual link-scan passes
// Progress bar cue appears at 500ms so the wait feels acknowledged, not silent
const HOVER_DELAY_MS = 1500;
const INTENT_CUE_MS  = 500;

function resetState() {
    if (isPinned) return; // Block all resets while pinned
    clearTimeout(hoverTimer);
    clearTimeout(intentTimer);
    // Reset intent bar instantly
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
    if (isPinned) return; // Don't process new hovers while pinned

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
    if (isPinned) return; // Don't do anything while pinned

    const isLeavingLink = currentLink && !currentLink.contains(e.relatedTarget);
    const isLeavingPopup = popup && !popup.contains(e.relatedTarget);

    if (isLeavingLink && isLeavingPopup) {
        resetState();
        currentLink = null;
    }
});

// Prevent popup from closing when cursor moves within/out of it while unpinned
popup.addEventListener('mouseout', (e) => {
    if (isPinned) return; // Don't close popup while pinned

    const isLeavingPopup = popup && !popup.contains(e.relatedTarget);
    const isLeavingLink = currentLink && !currentLink.contains(e.relatedTarget);

    if (isLeavingPopup && isLeavingLink) {
        resetState();
        currentLink = null;
    }
});

// --- Render helpers ---

function togglePin() {
    isPinned = !isPinned;
    const pinBtn = document.getElementById('qs-pin-btn');
    if (pinBtn) {
        if (isPinned) {
            pinBtn.style.background = 'white';
            pinBtn.style.color = '#ff6200';
            pinBtn.style.border = '2px solid #ff6200';
            pinBtn.innerHTML = '📌';
        } else {
            pinBtn.style.background = 'rgba(255,255,255,0.15)';
            pinBtn.style.color = 'white';
            pinBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            pinBtn.innerHTML = '📍';
            // Close popup when unpinned
            currentSummaryData = null;
            currentLink = null;
            popup.style.display = 'none';
        }
    }
}

// --- Icon constants (lightweight SVG icons) ---
const ICON_COPY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
const ICON_SAVE_OUTLINE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;
const ICON_SAVE_FILLED  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>`;

function copyToClipboard() {
    if (!currentSummaryData) return;

    const summaryText = Array.isArray(currentSummaryData.summary)
        ? currentSummaryData.summary.join('\n• ')
        : currentSummaryData.summary;

    const fullText = `• ${summaryText}\n\nSentiment: ${currentSummaryData.sentiment || 'N/A'}\nCategory: ${currentSummaryData.category || 'N/A'}`;

    navigator.clipboard.writeText(fullText).then(() => {
        const copyBtn = document.getElementById('qs-copy-btn');
        if (copyBtn) {
            copyBtn.innerHTML = '<span style="font-size:12px;font-weight:600;">✓ Copied</span>';
            copyBtn.style.background = '#4ade80';
            copyBtn.style.color = '#0a1a0a';

            setTimeout(() => {
                copyBtn.style.transition = 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease';
                copyBtn.style.opacity = '0.15';
                setTimeout(() => {
                    copyBtn.innerHTML = ICON_COPY;
                    copyBtn.style.background = 'rgba(255,255,255,0.08)';
                    copyBtn.style.color = '#bec5d1';
                    copyBtn.style.opacity = '1';
                    setTimeout(() => { copyBtn.style.transition = 'all 0.2s ease'; }, 120);
                }, 120);
            }, 700);
        }
    }).catch(() => {
        alert('Failed to copy to clipboard');
    });
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
                title: document.title,
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

                        saveBtn.innerHTML = '🗑';

                        saveBtn.style.background = '#ef4444';
                        saveBtn.style.color = '#08111f';

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

                saveBtn.innerHTML = '💾';

                saveBtn.style.background =
                    'rgba(255,255,255,0.08)';

                saveBtn.style.color = '#bec5d1';
            }

        });

    });

}

function saveForLater() {
    // TODO: Implement save for later functionality
    // This will save the current summary to local storage or send to backend
    if (!currentSummaryData) return;

    const saveBtn = document.getElementById('qs-save-btn');
    chrome.storage.local.get(['savedSummaries'], (result) => {

    const saved = result.savedSummaries || [];

    const exists = saved.some(
        item => item.url === currentLink?.href
    );

    if (exists && saveBtn) {

        saveBtn.innerHTML = '🗑';

        saveBtn.style.background = '#ef4444';
        saveBtn.style.color = 'white';

        saveBtn.setAttribute(
            'data-tip',
            'Remove saved summary'
        );
    }

});
    if (saveBtn) {
        saveBtn.innerHTML = '✓ Saved!';
        saveBtn.style.background = '#4ade80';
        saveBtn.style.color = '#0a1a0a';
        saveBtn.style.fontWeight = '600';
        saveBtn.style.fontSize = '12px';
        saveBtn.style.opacity = '1';
        setTimeout(() => {
            saveBtn.style.transition = 'opacity 0.12s ease, background 0.12s ease, color 0.12s ease';
            saveBtn.style.opacity = '0.15';
            setTimeout(() => {
                saveBtn.innerHTML = '💾';
                saveBtn.style.background = 'rgba(255,255,255,0.08)';
                saveBtn.style.color = '#bec5d1';
                saveBtn.style.fontWeight = '';
                saveBtn.style.fontSize = '14px';
                saveBtn.style.opacity = '1';
                setTimeout(() => { saveBtn.style.transition = 'all 0.2s ease'; }, 120);
            }, 120);
        }, 700);
    }
}

function sentimentStyle(sentiment) {
    const s = (sentiment || '').toLowerCase();
    if (s === 'positif' || s === 'positive')
        return { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)' };
    if (s === 'negatif' || s === 'negative')
        return { color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)' };
    return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' };
}

function renderSummary(data) {
    currentSummaryData = data;
    const ss = sentimentStyle(data.sentiment);

    const bullets = Array.isArray(data.summary)
        ? data.summary.map((s, i) => `
            <li style="
                display: flex;
                gap: 10px;
                align-items: flex-start;
                padding: 8px 0;
                ${i < data.summary.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.045);' : ''}
                list-style: none;
            ">
                <span style="
                    color: #ff6200;
                    margin-top: 6px;
                    flex-shrink: 0;
                    font-size: 6px;
                    opacity: 0.9;
                ">◆</span>
                <span style="
                    color: #d8dde8;
                    font-size: 13px;
                    line-height: 1.6;
                    font-weight: 400;
                ">${s}</span>
            </li>`).join('')
        : `<li style="color:#d8dde8; font-size:13px; list-style:none;">${data.summary}</li>`;

    popup.innerHTML = `
        <div class="qs-card" style="
            background: #0f1014;
            border: 1px solid #1e2128;
            border-radius: 14px;
            box-shadow:
                0 24px 64px rgba(0,0,0,0.75),
                0 0 0 1px rgba(255,98,0,0.06),
                inset 0 1px 0 rgba(255,255,255,0.04);
            width: 340px;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
            <!-- Header bar -->
            <div style="
                background: linear-gradient(105deg, #e85500 0%, #ff7a2e 100%);
                padding: 9px 14px;
                display: flex;
                align-items: center;
                gap: 7px;
            ">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M7 1L8.8 5.2L13.5 5.7L10.1 8.7L11.1 13.4L7 11L2.9 13.4L3.9 8.7L0.5 5.7L5.2 5.2L7 1Z" fill="rgba(255,255,255,0.9)"/>
                </svg>
                <span style="
                    font-weight: 700;
                    color: white;
                    font-size: 10.5px;
                    text-transform: uppercase;
                    letter-spacing: 1.2px;
                ">AI Summary</span>
                <!-- Pin button -->
                <button id="qs-pin-btn" style="
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.2);
                    color: white;
                    width: 26px;
                    height: 26px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    transition: all 0.2s ease;
                    padding: 0;
                    margin-left: auto;
                ">📍</button>
            </div>

            <!-- Bullet points -->
            <div style="padding: 6px 15px 10px 15px;">
                <ul style="margin: 0; padding: 0;">
                    ${bullets}
                </ul>
            </div>

            <!-- Footer -->
            <div style="
                background: #0a0b0e;
                border-top: 1px solid #1a1d24;
                padding: 10px 13px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 9px;
            ">
                <!-- Sentiment & Category chips -->
                <div style="display: flex; gap: 8px; align-items: center;">
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        background: ${ss.bg};
                        border: 1px solid ${ss.border};
                        padding: 4px 10px 4px 8px;
                        border-radius: 20px;
                        flex-shrink: 0;
                    ">
                        <span style="
                            width: 6px; height: 6px;
                            border-radius: 50%;
                            background: ${ss.color};
                            display: inline-block;
                            flex-shrink: 0;
                        "></span>
                        <span style="color: ${ss.color}; font-size: 11px; font-weight: 600;">${data.sentiment || 'N/A'}</span>
                    </div>

                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 5px;
                        background: rgba(255,255,255,0.04);
                        border: 1px solid rgba(255,255,255,0.1);
                        padding: 4px 10px;
                        border-radius: 20px;
                        flex-shrink: 0;
                    ">
                        <span style="font-size: 11px;">🗂</span>
                        <span style="color: #bec5d1; font-size: 11px; font-weight: 600;">${data.category || 'N/A'}</span>
                    </div>
                </div>

                <!-- Copy & Save buttons -->
                <div style="display: flex; gap: 6px;">
                    <button id="qs-copy-btn" class="qs-icon-btn" data-tip="Copy" style="
                        background: rgba(255,255,255,0.08);
                        border: 1px solid rgba(255,255,255,0.12);
                        color: #bec5d1;
                        height: 28px;
                        width: 32px;
                        border-radius: 7px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                        padding: 0;
                    "></button>

                    <button id="qs-save-btn" class="qs-icon-btn" data-tip="Save for later" style="
                        background: rgba(255,255,255,0.08);
                        border: 1px solid rgba(255,255,255,0.12);
                        color: #bec5d1;
                        height: 28px;
                        width: 32px;
                        border-radius: 7px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                        padding: 0;
                    "></button>
                </div>
            </div>
        </div>
    `;

    // Attach event listeners and set initial icon state
    setTimeout(async () => {
        const pinBtn  = document.getElementById('qs-pin-btn');
        const copyBtn = document.getElementById('qs-copy-btn');
        const saveBtn = document.getElementById('qs-save-btn');

        if (pinBtn)  pinBtn.addEventListener('click', togglePin);

        if (copyBtn) {
            copyBtn.innerHTML = ICON_COPY;
            copyBtn.addEventListener('click', copyToClipboard);
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', saveForLater);
            // Async check: reflect saved state immediately on render
            const url = currentLink ? currentLink.href : window.location.href;
            const items = await getSavedItems();
            const isSaved = items.some(item => item.url === url);
            setSaveBtnState(saveBtn, isSaved);
        }
        
        if (pinBtn) pinBtn.addEventListener('click', togglePin);
        if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
        if (saveBtn) saveBtn.addEventListener('click', saveSummary);
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