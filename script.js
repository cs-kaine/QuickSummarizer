let hoverTimer;
let intentTimer;
let currentLink = null;
let isActive = false;
let currentRequest = null;
let requestInProgress = false;

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
    #qs-popup {
        position: absolute;
        z-index: 2147483647;
        display: none;
        pointer-events: none;
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
        /* NO transform/rotation on this element */
    }
    .qs-card {
        animation: qs-fadein 0.2s ease forwards;
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
const HOVER_DELAY_MS   = 1500;
const INTENT_CUE_MS    = 500;

function resetState() {
    clearTimeout(hoverTimer);
    clearTimeout(intentTimer);
    // Reset intent bar instantly
    intentBar.style.transition = 'none';
    intentBar.style.width = '0%';
    if (currentRequest) { currentRequest.abort(); currentRequest = null; }
    requestInProgress = false;
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

        // Loading card — spinner is a standalone element, nothing wrapping it rotates
        popup.innerHTML = `
            <div style="
                background: #141416;
                border: 1px solid #262830;
                border-radius: 12px;
                padding: 13px 16px;
                display: flex;
                align-items: center;
                gap: 11px;
                box-shadow: 0 12px 40px rgba(0,0,0,0.6);
                width: 230px;
            ">
                <div class="qs-spinner-circle"></div>
                <span class="qs-loading-text">Analyzing article…</span>
            </div>
        `;

        requestInProgress = true;
        const data = await getSummary(link.href);
        requestInProgress = false;

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
    if (currentLink && !currentLink.contains(e.relatedTarget)) {
        resetState();
        currentLink = null;
    }
});

// --- Render helpers ---

function sentimentStyle(sentiment) {
    const s = (sentiment || '').toLowerCase();
    if (s === 'positif' || s === 'positive')
        return { color: '#4ade80', bg: 'rgba(74,222,128,0.1)', border: 'rgba(74,222,128,0.25)' };
    if (s === 'negatif' || s === 'negative')
        return { color: '#ff6b6b', bg: 'rgba(255,107,107,0.1)', border: 'rgba(255,107,107,0.25)' };
    return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)' };
}

function renderSummary(data) {
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
                ${data.source === 'cache' ? `
                    <span style="
                        margin-left: auto;
                        font-size: 10px;
                        color: rgba(255,255,255,0.75);
                        background: rgba(0,0,0,0.2);
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-weight: 500;
                    ">⚡ Cached</span>` : ''}
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
                padding: 9px 13px;
                display: flex;
                align-items: center;
                gap: 7px;
            ">
                <!-- Sentiment chip -->
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    background: ${ss.bg};
                    border: 1px solid ${ss.border};
                    padding: 4px 10px 4px 8px;
                    border-radius: 20px;
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

                <!-- Category chip -->
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.1);
                    padding: 4px 10px;
                    border-radius: 20px;
                ">
                    <span style="font-size: 11px;">🗂</span>
                    <span style="color: #bec5d1; font-size: 11px; font-weight: 600;">${data.category || 'N/A'}</span>
                </div>

                <div style="margin-left: auto;">
                    <span style="color: #2a2f3a; font-size: 10px; font-weight: 500; letter-spacing: 0.4px;">quicksummarizer</span>
                </div>
            </div>
        </div>
    `;
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

// --- Toast ---
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