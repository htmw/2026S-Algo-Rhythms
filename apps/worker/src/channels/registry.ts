import type { DeliveryChannel } from './types.js';
import { EmailChannel } from './email.js';
import { SmsMockChannel } from './smsMock.js';
import { WebSocketChannel } from './websocket.js';

type ChannelFactory = () => DeliveryChannel;

const factories = new Map<string, ChannelFactory>([
  ['email', () => new EmailChannel()],
  ['sms_webhook', () => new SmsMockChannel()],
  ['websocket', () => new WebSocketChannel()],
]);

const instances = new Map<string, DeliveryChannel>();

export function getDeliveryChannel(channelType: string): DeliveryChannel | null {
  const existing = instances.get(channelType);
  if (existing) return existing;

  const factory = factories.get(channelType);
  if (!factory) return null;

  const channel = factory();
  instances.set(channelType, channel);
  return channel;
}
