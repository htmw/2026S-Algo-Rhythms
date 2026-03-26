export type NotificationStatus = "delivered" | "failed" | "queued" | "processing";
export type NotificationChannel = "email" | "push" | "sms";

export interface Notification {
  id: string;
  recipient: string;
  message: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  createdAt: string;
  deliveredAt: string | null;
}

export const mockNotifications: Notification[] = [
  {
    id: "notif-001",
    recipient: "alice@acme.com",
    message: "Your order has been shipped.",
    channel: "email",
    status: "delivered",
    createdAt: "2026-03-18T08:00:00Z",
    deliveredAt: "2026-03-18T08:00:03Z",
  },
  {
    id: "notif-002",
    recipient: "bob@globex.com",
    message: "Password reset requested.",
    channel: "email",
    status: "delivered",
    createdAt: "2026-03-18T08:05:00Z",
    deliveredAt: "2026-03-18T08:05:02Z",
  },
  {
    id: "notif-003",
    recipient: "carol@initech.com",
    message: "Your invoice is ready.",
    channel: "push",
    status: "failed",
    createdAt: "2026-03-18T08:10:00Z",
    deliveredAt: null,
  },
  {
    id: "notif-004",
    recipient: "dave@umbrella.com",
    message: "Welcome to NotifyEngine!",
    channel: "email",
    status: "queued",
    createdAt: "2026-03-18T08:15:00Z",
    deliveredAt: null,
  },
  {
    id: "notif-005",
    recipient: "eve@initech.com",
    message: "Your subscription renews tomorrow.",
    channel: "sms",
    status: "processing",
    createdAt: "2026-03-18T08:20:00Z",
    deliveredAt: null,
  },
  {
    id: "notif-006",
    recipient: "frank@acme.com",
    message: "New login detected on your account.",
    channel: "email",
    status: "delivered",
    createdAt: "2026-03-18T08:25:00Z",
    deliveredAt: "2026-03-18T08:25:04Z",
  },
  {
    id: "notif-007",
    recipient: "grace@globex.com",
    message: "Your export is ready to download.",
    channel: "push",
    status: "delivered",
    createdAt: "2026-03-18T08:30:00Z",
    deliveredAt: "2026-03-18T08:30:01Z",
  },
];