export interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs?: number;
  error?: string;
}

export interface DeliveryChannel {
  deliver(
    recipient: string,
    subject: string | null,
    body: string,
    bodyHtml: string | null,
  ): Promise<DeliveryResult>;
}
