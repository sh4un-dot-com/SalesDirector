const originalFetch = globalThis.fetch.bind(globalThis);

let geminiRequestCount = 0;

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || '';

  if (url.includes('generativelanguage.googleapis.com')) {
    geminiRequestCount += 1;
    const payload = geminiRequestCount === 1
      ? {
          candidates: [
            {
              finishReason: 'MAX_TOKENS',
              content: {
                parts: [{ text: 'Alpha segment that hit the first token ceiling.' }]
              }
            }
          ]
        }
      : {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [{ text: 'Continuation tail that completes the answer.' }]
              }
            }
          ]
        };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return originalFetch(input, init);
};