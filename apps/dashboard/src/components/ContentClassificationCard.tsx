import { useState, type ReactNode } from 'react';
import { AlertTriangle, Tag, MessageSquare, Radio, ChevronDown, ChevronUp, Key } from 'lucide-react';

interface ContentClassificationProps {
  classification: {
    urgency: number;
    category: string;
    time_sensitivity: number;
    sentiment: string;
    optimal_channel_hint: string;
    reasoning: string;
    keywords?: string[];
  } | null;
  notificationBody?: string;
  compact?: boolean;
}

function urgencyLevel(value: number): { label: string; color: string; bg: string } {
  if (value >= 0.8) return { label: 'High', color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/40' };
  if (value >= 0.5) return { label: 'Medium', color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/40' };
  return { label: 'Low', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/40' };
}

function Badge({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function highlightKeywords(text: string, keywords: string[]): ReactNode {
  if (keywords.length === 0) return text;

  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    const isMatch = keywords.some((k) => k.toLowerCase() === part.toLowerCase());
    if (isMatch) {
      return (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/50 dark:text-yellow-200 font-semibold rounded px-0.5">
          {part}
        </mark>
      );
    }
    return part;
  });
}

export function ContentClassificationCard({
  classification,
  notificationBody,
  compact = false,
}: ContentClassificationProps) {
  const [reasoningOpen, setReasoningOpen] = useState(!compact);

  if (!classification) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-4 text-sm text-gray-400">
        Classification unavailable
      </div>
    );
  }

  const urgency = urgencyLevel(classification.urgency);
  const keywords = classification.keywords ?? [];

  return (
    <div className={`rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${compact ? 'p-3 text-xs' : 'p-4 text-sm'}`}>
      <div className={`flex flex-wrap items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        <Badge className={`${urgency.bg} ${urgency.color}`}>
          <AlertTriangle className="h-3 w-3" />
          Urgency: {urgency.label} ({classification.urgency.toFixed(2)})
        </Badge>

        <Badge className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400">
          <Tag className="h-3 w-3" />
          {classification.category}
        </Badge>

        <Badge className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400">
          <MessageSquare className="h-3 w-3" />
          {classification.sentiment}
        </Badge>

        <Badge className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
          <Radio className="h-3 w-3" />
          Channel: {classification.optimal_channel_hint}
        </Badge>
      </div>

      {keywords.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-2' : 'mt-3'}`}>
          <Key className="h-3 w-3 text-gray-400" />
          {keywords.map((kw) => (
            <span
              key={kw}
              className="inline-block rounded bg-yellow-100 dark:bg-yellow-900/40 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:text-yellow-300"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {notificationBody && keywords.length > 0 && (
        <p className={`text-gray-600 dark:text-gray-300 leading-relaxed ${compact ? 'mt-2' : 'mt-3'}`}>
          {highlightKeywords(notificationBody, keywords)}
        </p>
      )}

      <div className={compact ? 'mt-2' : 'mt-3'}>
        <button
          type="button"
          onClick={() => setReasoningOpen((prev) => !prev)}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          {reasoningOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Reasoning
        </button>
        {reasoningOpen && (
          <p className={`text-gray-600 dark:text-gray-300 leading-relaxed ${compact ? 'mt-1' : 'mt-2'}`}>
            {classification.reasoning}
          </p>
        )}
      </div>
    </div>
  );
}
