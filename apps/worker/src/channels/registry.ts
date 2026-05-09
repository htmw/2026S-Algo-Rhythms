import type { DeliveryChannel } from './types.js';
import { EmailChannel } from './email.js';
import { WebSocketChannel } from './websocket.js';

const registry = new Map<string, DeliveryChannel>([
  ['email', new EmailChannel()],
  ['websocket', new WebSocketChannel()],
]);

export function getDeliveryChannel(channelType: string): DeliveryChannel | null {
  return registry.get(channelType) ?? null;
}   