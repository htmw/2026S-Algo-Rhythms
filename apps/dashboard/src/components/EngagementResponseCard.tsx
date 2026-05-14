import { CheckCircle, XCircle, Radio, Brain } from 'lucide-react';

interface EngagementResponseCardProps {
  engagement: {
    engaged: boolean;
    reason: string | null;
    channel: string;
    engagementType: string | null;
  };
  recipientId: string;
}

const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  email_lover: 'Email Enthusiast',
  push_fan: 'Push Notification Fan',
  sms_responder: 'SMS Responder',
  balanced: 'Balanced User',
  disengaged: 'Disengaged User',
};

const PERSONA_PATTERN = /^user_(.+?)_\d+@test\.notifyengine\.dev$/;

function extractPersonaLabel(recipientId: string): { label: string; isPersona: boolean } {
  const match = PERSONA_PATTERN.exec(recipientId);
  if (match) {
    const key = match[1];
    const displayName = PERSONA_DISPLAY_NAMES[key];
    if (displayName) return { label: displayName, isPersona: true };
  }
  return { label: recipientId, isPersona: false };
}

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function EngagementResponseCard({ engagement, recipientId }: EngagementResponseCardProps) {
  const persona = extractPersonaLabel(recipientId);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {engagement.engaged ? (
          <Badge className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400">
            <CheckCircle className="h-3 w-3" />
            Engaged
          </Badge>
        ) : (
          <Badge className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">
            <XCircle className="h-3 w-3" />
            Not Engaged
          </Badge>
        )}

        <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          <Radio className="h-3 w-3" />
          {engagement.channel}
        </Badge>

        {engagement.engagementType && (
          <Badge className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
            {engagement.engagementType}
          </Badge>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400">
        {persona.isPersona ? (
          <span>Persona: <span className="font-medium text-gray-900 dark:text-gray-100">{persona.label}</span></span>
        ) : (
          <span>Recipient: <span className="font-medium text-gray-900 dark:text-gray-100">{persona.label}</span></span>
        )}
      </div>

      {engagement.reason ? (
        <div className="mt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
            <Brain className="h-3 w-3" />
            Engagement Reasoning
          </div>
          <div className="rounded bg-gray-50 dark:bg-gray-700/50 p-2.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {engagement.reason}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">Engagement reasoning not available</p>
      )}
    </div>
  );
}
