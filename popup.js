document.addEventListener('DOMContentLoaded', () => {
    loadSavedSummaries();
});

function removeSavedSummary(id) {

    chrome.storage.local.get(
        ['savedSummaries'],
        (result) => {

            const saved =
                result.savedSummaries || [];

            const updated =
                saved.filter(item => item.id !== id);

            chrome.storage.local.set(
                {
                    savedSummaries: updated
                },
                () => {

                    console.log(
                        'Removed saved summary'
                    );

                    loadSavedSummaries();

                }
            );

        }
    );

}

function loadSavedSummaries() {

    const container = document.getElementById('saved-list');

    if (!container) {
        console.error('saved-list not found');
        return;
    }

    chrome.storage.local.get(['savedSummaries'], (result) => {

        console.log('Loaded data:', result);

        const saved = result.savedSummaries || [];

        if (saved.length === 0) {

            container.innerHTML = `
                <div class="empty-state">
                    No saved summaries yet.
                </div>
            `;

            return;
        }

        container.innerHTML = saved.map(item => `

    <div class="saved-item">

        <button
            class="remove-btn"
            data-id="${item.id}"
        >
            ✕
        </button>

        <div class="saved-title">
            ${item.title}
        </div>

        <div class="saved-summary">
            ${
                Array.isArray(item.summary)
                ? item.summary[0]
                : item.summary
            }
        </div>

        <div class="saved-meta">

            <div class="saved-chip">
                ${item.sentiment}
            </div>

            <div class="saved-chip">
                ${item.category}
            </div>

        </div>

    </div>

`).join('');


const removeButtons =
    document.querySelectorAll('.remove-btn');

removeButtons.forEach(btn => {

    btn.addEventListener('click', () => {

        const id = Number(btn.dataset.id);

        removeSavedSummary(id);

    });

});

    });

}