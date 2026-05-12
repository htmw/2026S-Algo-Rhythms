import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockCreate, MockAnthropic } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn(function (this: { messages: { create: typeof mockCreate } }) {
    this.messages = { create: mockCreate };
  });
  return { mockCreate, MockAnthropic };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: MockAnthropic,
}));

vi.mock('../../src/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { classifyContent } from '../../src/services/contentClassification.js';

const VALID_RESPONSE = {
  urgency_score: 0.8,
  category: 'security',
  category_encoded: 0,
  time_sensitivity_score: 0.9,
  sentiment_score: 0.3,
  optimal_channel_hint: 'sms_webhook',
  reasoning: 'Security alert requires immediate attention',
};

function sdkResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

describe('classifyContent', () => {
  let originalApiKey: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalApiKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('returns valid ContentClassification for normal input', async () => {
    mockCreate.mockResolvedValueOnce(sdkResponse(JSON.stringify(VALID_RESPONSE)));

    const result = await classifyContent('Security Alert', 'Your account was accessed from a new device');

    expect(result).not.toBeNull();
    expect(result!.urgency_score).toBeGreaterThanOrEqual(0);
    expect(result!.urgency_score).toBeLessThanOrEqual(1);
    expect(['security', 'marketing', 'transactional', 'social', 'operational']).toContain(result!.category);
    expect(Number.isInteger(result!.category_encoded)).toBe(true);
    expect(result!.time_sensitivity_score).toBeGreaterThanOrEqual(0);
    expect(result!.time_sensitivity_score).toBeLessThanOrEqual(1);
    expect(result!.sentiment_score).toBeGreaterThanOrEqual(0);
    expect(result!.sentiment_score).toBeLessThanOrEqual(1);
    expect(['email', 'sms_webhook', 'websocket', 'webhook']).toContain(result!.optimal_channel_hint);
    expect(typeof result!.reasoning).toBe('string');
  });

  it('returns null when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
    expect(MockAnthropic).not.toHaveBeenCalled();
  });

  it('returns null on API timeout', async () => {
    mockCreate.mockImplementationOnce(
      (_body: unknown, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted', 'AbortError')),
            );
          }
        }),
    );

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
  }, 15000);

  it('returns null on malformed JSON response', async () => {
    mockCreate.mockResolvedValueOnce(sdkResponse('this is not json'));

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
  });

  it('returns null on valid JSON with wrong shape', async () => {
    mockCreate.mockResolvedValueOnce(sdkResponse('{"foo": "bar"}'));

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Internal Server Error'));

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
  });

  it('returns null when urgency_score is out of range', async () => {
    const badResponse = { ...VALID_RESPONSE, urgency_score: 1.5 };
    mockCreate.mockResolvedValueOnce(sdkResponse(JSON.stringify(badResponse)));

    const result = await classifyContent('Test', 'Test body');

    expect(result).toBeNull();
  });
});
