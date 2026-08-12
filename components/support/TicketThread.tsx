/**
 * TicketThread — the conversation on a support ticket.
 *
 * Server component, shared by the owner and admin views. Staff messages are
 * distinguished by the snapshotted isStaff flag on the message, not by the
 * author's current role — someone who leaves the support team must not turn
 * their past replies into user messages.
 */

import { Paperclip } from "lucide-react";

export interface ThreadMessage {
  id: string;
  body: string;
  attachments: string[];
  isStaff: boolean;
  createdAt: Date;
  author: { name: string | null };
}

export default function TicketThread({
  messages,
}: {
  messages: ThreadMessage[];
}) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-2xl p-4 shadow-sm ${
            m.isStaff ? "bg-brand-wash" : "bg-white"
          }`}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-ink">
              {m.isStaff ? "ZuriDrive Support" : (m.author.name ?? "You")}
            </p>
            <time
              dateTime={m.createdAt.toISOString()}
              className="shrink-0 text-[11px] text-ink-faint"
            >
              {m.createdAt.toLocaleString("en-RW")}
            </time>
          </div>

          <p className="whitespace-pre-wrap text-sm text-ink-muted">{m.body}</p>

          {m.attachments.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {m.attachments.map((url, i) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-brand ring-1 ring-sand-dark hover:ring-brand"
                  >
                    <Paperclip className="h-3 w-3" />
                    Attachment {i + 1}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
