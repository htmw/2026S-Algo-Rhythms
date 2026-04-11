import { describe, it, expect } from 'vitest';
import { SendNotificationSchema } from '@notifyengine/shared';
import { ListNotificationsQuerySchema } from '../../src/schemas/notification.js';

describe('SendNotificationSchema', () => {
  it('accepts a valid minimal notification body', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
      body: 'Hello world',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.recipient).toBe('user@example.com');
      expect(result.data.body).toBe('Hello world');
      expect(result.data.priority).toBe('standard');
      expect(result.data.routing_mode).toBe('adaptive');
    }
  });

  it('accepts a fully populated notification body', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
      subject: 'Test Subject',
      body: 'Hello world',
      body_html: '<p>Hello world</p>',
      priority: 'critical',
      routing_mode: 'forced',
      channel_preference: ['email', 'websocket'],
      force_channel: 'email',
      metadata: { campaign: 'test-campaign' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBe('critical');
      expect(result.data.routing_mode).toBe('forced');
      expect(result.data.force_channel).toBe('email');
      expect(result.data.channel_preference).toEqual(['email', 'websocket']);
    }
  });

  it('rejects when recipient is missing', () => {
    const result = SendNotificationSchema.safeParse({
      body: 'Hello world',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when body is missing', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when recipient is empty string', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: '',
      body: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority value', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
      body: 'Hello',
      priority: 'urgent',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid routing_mode value', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
      body: 'Hello',
      routing_mode: 'random',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when subject exceeds 500 characters', () => {
    const result = SendNotificationSchema.safeParse({
      recipient: 'user@example.com',
      body: 'Hello',
      subject: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid priority values', () => {
    for (const priority of ['critical', 'high', 'standard', 'bulk']) {
      const result = SendNotificationSchema.safeParse({
        recipient: 'user@example.com',
        body: 'Hello',
        priority,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid routing_mode values', () => {
    for (const routing_mode of ['adaptive', 'static', 'forced']) {
      const result = SendNotificationSchema.safeParse({
        recipient: 'user@example.com',
        body: 'Hello',
        routing_mode,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('ListNotificationsQuerySchema', () => {
  it('applies defaults when no query params provided', () => {
    const result = ListNotificationsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.status).toBeUndefined();
      expect(result.data.cursor).toBeUndefined();
    }
  });

  it('accepts valid status filter', () => {
    const result = ListNotificationsQuerySchema.safeParse({ status: 'delivered' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('delivered');
    }
  });

  it('rejects invalid status value', () => {
    const result = ListNotificationsQuerySchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('coerces limit from string to number', () => {
    const result = ListNotificationsQuerySchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit above 100', () => {
    const result = ListNotificationsQuerySchema.safeParse({ limit: '101' });
    expect(result.success).toBe(false);
  });

  it('rejects limit below 1', () => {
    const result = ListNotificationsQuerySchema.safeParse({ limit: '0' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid ISO 8601 cursor', () => {
    const result = ListNotificationsQuerySchema.safeParse({
      cursor: '2026-04-01T12:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid cursor format', () => {
    const result = ListNotificationsQuerySchema.safeParse({
      cursor: 'not-a-date',
    });
    expect(result.success).toBe(false);
  });
});
