import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { predictChannel } from '../src/mlClient.js';
import type { FeatureVector } from '../src/features.js';

const dummyFeatures: FeatureVector = {
  channel_type: 'email',
  hour_of_day: 14,
  day_of_week: 2,
  is_weekend: 0,
  historical_success_rate: 0.8,
  historical_engagement_rate: 0.5,
  hours_since_last_engagement: 24,
  hours_since_last_success: 24,
  avg_latency_ms: 320,
  attempts_30d: 50,
  notifications_sent_24h: 3,
  notifications_sent_7d: 12,
  notification_priority_score: 3,
  content_length: 250,
  channel_health: 1,
};

const request = {
  recipient: 'user@example.com',
  available_channels: ['email', 'websocket'],
  features_per_channel: { email: dummyFeatures, websocket: dummyFeatures },
  exploration_rate: 0.1,
};

describe('predictChannel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed prediction on a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          selected: 'email',
          predictions: { email: 0.82, websocket: 0.45 },
          exploration: false,
          reason: 'XGBoost predicted email',
          model_version: 'v12',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await predictChannel(request, { baseUrl: 'http://ml-test:8000' });

    expect(result).not.toBeNull();
    expect(result?.selected).toBe('email');
    expect(result?.predictions.email).toBeCloseTo(0.82);
    expect(result?.exploration).toBe(false);
    expect(result?.model_version).toBe('v12');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ml-test:8000/predict');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('returns null when ML service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await predictChannel(request, { baseUrl: 'http://nope:8000' });
    expect(result).toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
    );
    const result = await predictChannel(request, { baseUrl: 'http://ml-test:8000' });
    expect(result).toBeNull();
  });

  it('returns null on a malformed response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ wrong: 'shape' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const result = await predictChannel(request, { baseUrl: 'http://ml-test:8000' });
    expect(result).toBeNull();
  });

  it('returns null when AbortController timeout fires', async () => {
    // Simulate a response that takes longer than the timeout.
    // Use a short timeout (50ms) and a fetch that resolves after 200ms.
    const fetchMock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve(new Response(JSON.stringify({ selected: 'email' }), { status: 200 })),
            200,
          );
          // If aborted before resolve, reject with AbortError
          init.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await predictChannel(request, {
      baseUrl: 'http://ml-test:8000',
      timeoutMs: 50,
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
