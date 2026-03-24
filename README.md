# PROJECT: Quicksummarizer 0.2

## Stack:
- Manifest: V3
- Languages: Node.js, CSS, HTML
- API: Gemini 3.0 Flash Preview
- Browser(s): Google Chrome

## Features:
- Core Hover Detection (Kaine, ): Mostly finished, needs polishing
- Summarization Engine(Kaine, ): Currently hitting rate limits rather quickly & need to decide how concise the summary should be
- Popup UI(Kaine, ): Needs Improvement (ideas?)
- Collections Page(): Unimplemented
- Trusted Websites(): Unimplemented
- Multi-Browser support(): Unimplemented
- Multi-LLM support(): Unimplemented
- etc

## Known Bugs & Issues
1. 429 TooManyRequests errors:
    "Using a local llm would be ideal for testing (and as an optional feature, honestly), or even just a placeholder text if we're feeling lazy. It is just an API call after all, swapping around shouldn't be too difficult" -Kaine
2. Height of popup window doesn't wrap around content properly
3. The LLM can be real slow (wait times >5 seconds)

## Local Development Setup
1. Install Node.js
2. Using Node.js v18+, install the Google Gen AI SDK for TypeScript and JavaScript using the following npm command in cmd: 
    npm install @google/genai
3. Open Chrome
4. Open chrome://extensions
5. Enable Developer Mode
6. Click Load Unpacked and select the project directory

## How to use
1. Open Google AI Studio
2. Generate and copy API key
3. Open Extensions and click on "QuickSummarizer"
4. Paste in API key
5. Hover on links

## Notes
- API keys should stay private. 
- "The current implementation will need the user to generate and use their own keys. While this means devs don't foot the bill for tokens, it also adds a lot of friction to the user experience. Maybe there's a better solution?" -Kaine

## References
- https://ai.google.dev/gemini-api/docs/quickstart#javascript_1
- https://ai.google.dev/gemini-api/docs/api-key#javascript
- https://nodejs.org/docs/latest/api/