import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../logger.js';
import { getPersona } from './personas.js';

export interface DeliveryContext {
  recipientId: string;
  channel: string;
  subject: string;
  body: string;
  contentClassification: Record<string, unknown> | null;
  hourOfDay: number;
  dayOfWeek: number;
  isWeekend: boolean;
}

export interface EngagementDecision {
  engaged: boolean;
  reason: string;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTimeContext(ctx: DeliveryContext): string {
  const period =
    ctx.hourOfDay < 6 ? 'early morning'
    : ctx.hourOfDay < 12 ? 'morning'
    : ctx.hourOfDay < 17 ? 'afternoon'
    : ctx.hourOfDay < 21 ? 'evening'
    : 'late night';
  const day = DAYS[ctx.dayOfWeek] ?? 'Unknown';
  return `${period} (${ctx.hourOfDay}:00) on a ${day}${ctx.isWeekend ? ' (weekend)' : ''}`;
}

function buildUserMessage(ctx: DeliveryContext): string {
  let message = `You just received a notification via **${ctx.channel}**.\n\n`;

  if (ctx.subject) {
    message += `**Subject:** ${ctx.subject}\n`;
  }
  message += `**Body:** ${ctx.body}\n\n`;

  if (ctx.contentClassification) {
    const cc = ctx.contentClassification;
    const parts: string[] = [];
    if (cc.category) parts.push(`category: ${cc.category}`);
    if (typeof cc.urgency_score === 'number') parts.push(`urgency: ${(cc.urgency_score as number).toFixed(2)}`);
    if (typeof cc.time_sensitivity_score === 'number') parts.push(`time-sensitivity: ${(cc.time_sensitivity_score as number).toFixed(2)}`);
    if (parts.length > 0) {
      message += `**Content analysis:** ${parts.join(', ')}\n\n`;
    }
  }

  message += `**Current time:** ${formatTimeContext(ctx)}\n\n`;
  message += `Would you engage with this notification? Respond with JSON only: { "engaged": true/false, "reason": "..." }`;

  return message;
}

export async function simulateEngagement(
  context: DeliveryContext,
): Promise<EngagementDecision | null> {
  const persona = getPersona(context.recipientId);
  if (!persona) return null;

  if (!process.env.ANTHROPIC_API_KEY) {
    logger.debug('ANTHROPIC_API_KEY not set, skipping engagement simulation');
    return null;
  }

  try {
    const client = new Anthropic();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let response;
    try {
      response = await client.messages.create(
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: persona.systemPrompt,
          messages: [{ role: 'user', content: buildUserMessage(context) }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timeout);
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn({ recipientId: context.recipientId }, 'Engagement simulation returned no text block');
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      logger.warn({ raw: textBlock.text, recipientId: context.recipientId }, 'Engagement simulation returned invalid JSON');
      return null;
    }

    if (
      typeof parsed !== 'object' || parsed === null
      || typeof (parsed as Record<string, unknown>).engaged !== 'boolean'
      || typeof (parsed as Record<string, unknown>).reason !== 'string'
    ) {
      logger.warn({ raw: parsed, recipientId: context.recipientId }, 'Engagement simulation response failed validation');
      return null;
    }

    const result = parsed as EngagementDecision;
    return { engaged: result.engaged, reason: result.reason };
  } catch (err) {
    logger.warn({ err, recipientId: context.recipientId }, 'Engagement simulation failed');
    return null;
  }
}
