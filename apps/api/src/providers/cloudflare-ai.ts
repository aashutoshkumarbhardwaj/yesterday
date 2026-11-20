import { config } from '../config.js';

export function isCloudflareAIConfigured(): boolean {
  return Boolean(config.cloudflare.accountId && config.cloudflare.apiToken);
}

function getCloudflareHeaders() {
  if (!config.cloudflare.apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN is not configured in .env');
  }
  return {
    Authorization: `Bearer ${config.cloudflare.apiToken}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Transcribes audio using Cloudflare Workers AI Whisper (@cf/openai/whisper)
 */
export async function transcribeWithCloudflareWhisper(audioBytes: Buffer): Promise<{ transcript: string }> {
  const { accountId, apiToken } = config.cloudflare;
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials missing (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN).');
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/octet-stream'
      },
      body: new Uint8Array(audioBytes)
    }
  );

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message ?? `Cloudflare Whisper failed (${response.status})`);
  }

  return {
    transcript: data.result?.text?.trim() ?? ''
  };
}

/**
 * Generates embeddings via Cloudflare Workers AI (@cf/baai/bge-base-en-v1.5)
 */
export async function embedWithCloudflare(texts: string[]): Promise<number[][]> {
  const { accountId, apiToken } = config.cloudflare;
  if (!accountId || !apiToken) throw new Error('Cloudflare credentials missing.');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-base-en-v1.5`,
    {
      method: 'POST',
      headers: getCloudflareHeaders(),
      body: JSON.stringify({ text: texts })
    }
  );

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message ?? `Cloudflare Embeddings failed (${response.status})`);
  }

  return data.result?.data ?? [];
}

/**
 * Fast LLM query via Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
 */
export async function generateWithCloudflareLlama(prompt: string, systemPrompt?: string): Promise<string> {
  const { accountId, apiToken } = config.cloudflare;
  if (!accountId || !apiToken) throw new Error('Cloudflare credentials missing.');

  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt }
  ];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
    {
      method: 'POST',
      headers: getCloudflareHeaders(),
      body: JSON.stringify({ messages, max_tokens: 1024, temperature: 0.3 })
    }
  );

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data.success) {
    throw new Error(data.errors?.[0]?.message ?? `Cloudflare Llama failed (${response.status})`);
  }

  return data.result?.response?.trim() ?? '';
}
