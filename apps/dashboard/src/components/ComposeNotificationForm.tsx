import { useState } from 'react';
import { Send, Loader2, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useNotificationPolling, type RawContentClassification } from '../hooks/useNotificationPolling.js';
import { ContentClassificationCard } from './ContentClassificationCard.js';
import { PredictionRoutingCard } from './PredictionRoutingCard.js';
import { EngagementResponseCard } from './EngagementResponseCard.js';

interface ComposeNotificationFormProps {
  onNotificationSent?: (notification: { id: string; status: string }) => void;
}

interface PostResponse {
  id: string;
  status: string;
  priority: string;
  routing_mode: string;
  created_at: string;
  status_url: string;
  request_id: string;
}

const PERSONAS = [
  { value: '', label: 'Select a persona...' },
  { value: 'email_lover', label: 'Email Enthusiast (~85% email engagement)' },
  { value: 'push_fan', label: 'Push Notification Fan (~80% websocket)' },
  { value: 'sms_responder', label: 'SMS Responder (prefers SMS)' },
  { value: 'balanced', label: 'Balanced User (no strong preference)' },
  { value: 'disengaged', label: 'Disengaged User (low engagement)' },
] as const;

interface MappedClassification {
  urgency: number;
  category: string;
  time_sensitivity: number;
  sentiment: string;
  optimal_channel_hint: string;
  reasoning: string;
  keywords?: string[];
}

function mapSentiment(score: number): string {
  if (score < 0.3) return 'negative';
  if (score <= 0.6) return 'neutral';
  return 'positive';
}

function mapClassification(raw: RawContentClassification): MappedClassification {
  return {
    urgency: raw.urgency_score,
    category: raw.category,
    time_sensitivity: raw.time_sensitivity_score,
    sentiment: mapSentiment(raw.sentiment_score),
    optimal_channel_hint: raw.optimal_channel_hint,
    reasoning: raw.reasoning,
    keywords: raw.keywords,
  };
}

function classifyError(err: unknown): string {
  if (err instanceof TypeError) return 'Cannot reach API server';
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) return 'API key invalid or expired';
  if (msg.includes('429')) return 'Rate limited - wait and retry';
  return msg;
}

export function ComposeNotificationForm({ onNotificationSent }: ComposeNotificationFormProps) {
  const [persona, setPersona] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('standard');
  const [routingMode, setRoutingMode] = useState('adaptive');

  const [sending, setSending] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [notificationId, setNotificationId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const { classification, routingDecision, deliveredVia, status, engagementResult, isPolling, error: pollingError } = useNotificationPolling(notificationId);

  function handlePersonaChange(value: string) {
    setPersona(value);
    if (value) {
      setRecipient(`user_${value}_${Date.now()}@test.notifyengine.dev`);
    }
  }

  function handleReset() {
    setPersona('');
    setRecipient('');
    setSubject('');
    setBody('');
    setPriority('standard');
    setRoutingMode('adaptive');
    setSending(false);
    setSentId(null);
    setNotificationId(null);
    setSubmitError(null);
    setValidationError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setValidationError(null);

    if (!recipient.trim() || !body.trim()) {
      setValidationError('Recipient and body are required.');
      return;
    }

    setSending(true);
    setSentId(null);
    setNotificationId(null);

    try {
      const res = await apiFetch<PostResponse>('/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          recipient: recipient.trim(),
          subject: subject.trim(),
          body: body.trim(),
          priority,
          routing_mode: routingMode,
        }),
      });

      setSentId(res.id);
      setNotificationId(res.id);
      onNotificationSent?.({ id: res.id, status: res.status });
    } catch (err) {
      setSubmitError(classifyError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Compose Notification</h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Persona selector */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Persona</label>
          <select
            value={persona}
            onChange={(e) => handlePersonaChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {PERSONAS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Recipient */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Recipient</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="user@example.com or persona ID"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Subject */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Subject <span className="text-gray-400 dark:text-gray-500 font-normal">(recommended)</span>
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Security Alert: Unusual Login"
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Body */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Notification body text..."
            rows={4}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y dark:caret-gray-100"
          />
        </div>

        {/* Priority + Routing mode side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="critical">critical</option>
              <option value="high">high</option>
              <option value="standard">standard</option>
              <option value="bulk">bulk</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Routing Mode</label>
            <select
              value={routingMode}
              onChange={(e) => setRoutingMode(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="adaptive">adaptive</option>
              <option value="static">static</option>
            </select>
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={sending}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
          ) : (
            <><Send className="h-4 w-4" /> Send Notification</>
          )}
        </button>

        {/* Validation error */}
        {validationError && (
          <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
        )}

        {/* Submit error */}
        {submitError && (
          <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
        )}
      </form>

      {/* Post-send UI */}
      {sentId && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">Sent — ID: {sentId}</p>

          {isPolling && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Polling for classification...
            </div>
          )}

          {pollingError && (
            <p className="text-sm text-amber-600 dark:text-amber-400">{pollingError}</p>
          )}

          {classification && (
            <ContentClassificationCard
              classification={mapClassification(classification)}
              notificationBody={body}
            />
          )}

          {routingDecision && (
            <PredictionRoutingCard
              routingDecision={routingDecision}
              deliveredVia={deliveredVia}
              status={status}
            />
          )}

          {classification && !engagementResult && isPolling && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Waiting for engagement simulation...
            </div>
          )}

          {engagementResult && (
            <EngagementResponseCard
              engagement={engagementResult}
              recipientId={recipient}
            />
          )}

          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Send Another
          </button>
        </div>
      )}
    </div>
  );
}
