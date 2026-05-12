import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';

export interface ContentClassification {
  urgency_score: number;
  category: string;
  category_encoded: number;
  time_sensitivity_score: number;
  sentiment_score: number;
  optimal_channel_hint: string;
  reasoning: string;
}

const VALID_CATEGORIES = ['security', 'marketing', 'transactional', 'social', 'operational'] as const;
const CATEGORY_ENCODING: Record<string, number> = {
  security: 0,
  marketing: 1,
  transactional: 2,
  social: 3,
  operational: 4,
};
const VALID_CHANNELS = ['email', 'sms_webhook', 'websocket', 'webhook'] as const;

function validate(obj: unknown): ContentClassification | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;

  if (typeof o.urgency_score !== 'number' || o.urgency_score < 0 || o.urgency_score > 1) return null;
  if (typeof o.time_sensitivity_score !== 'number' || o.time_sensitivity_score < 0 || o.time_sensitivity_score > 1) return null;
  if (typeof o.sentiment_score !== 'number' || o.sentiment_score < 0 || o.sentiment_score > 1) return null;
  if (typeof o.category !== 'string' || !VALID_CATEGORIES.includes(o.category as typeof VALID_CATEGORIES[number])) return null;
  if (typeof o.category_encoded !== 'number' || !Number.isInteger(o.category_encoded)) return null;
  if (o.category_encoded !== CATEGORY_ENCODING[o.category]) return null;
  if (typeof o.optimal_channel_hint !== 'string' || !VALID_CHANNELS.includes(o.optimal_channel_hint as typeof VALID_CHANNELS[number])) return null;
  if (typeof o.reasoning !== 'string') return null;

  return {
    urgency_score: o.urgency_score,
    category: o.category,
    category_encoded: o.category_encoded,
    time_sensitivity_score: o.time_sensitivity_score,
    sentiment_score: o.sentiment_score,
    optimal_channel_hint: o.optimal_channel_hint,
    reasoning: o.reasoning,
  };
}

const SYSTEM_PROMPT = `You are a notification content classifier. Analyze the notification subject and body, then return ONLY valid JSON with exactly these fields:

{
  "urgency_score": <number 0-1, where 1 is most urgent>,
  "category": <one of "security", "marketing", "transactional", "social", "operational">,
  "category_encoded": <integer: security=0, marketing=1, transactional=2, social=3, operational=4>,
  "time_sensitivity_score": <number 0-1, where 1 is most time-sensitive>,
  "sentiment_score": <number 0-1, where 0 is most negative and 1 is most positive>,
  "optimal_channel_hint": <one of "email", "sms_webhook", "websocket", "webhook">,
  "reasoning": <brief explanation of your classification>
}

Return ONLY the JSON object. No markdown, no code fences, no extra text.`;

export async function classifyContent(subject: string, body: string): Promise<ContentClassification | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    logger.debug('ANTHROPIC_API_KEY not set, skipping content classification');
    return null;
  }

  try {
    const client = new Anthropic();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await client.messages.create(
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: [
            { role: 'user', content: `Subject: ${subject}\n\nBody: ${body}` },
          ],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn('Content classification returned no text block');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      logger.warn({ raw: textBlock.text }, 'Content classification returned invalid JSON');
      return null;
    }

    const result = validate(parsed);
    if (!result) {
      logger.warn({ raw: parsed }, 'Content classification failed validation');
      return null;
    }

    return result;
  } catch (err) {
    logger.warn({ err }, 'Content classification failed');
    return null;
  }
}
