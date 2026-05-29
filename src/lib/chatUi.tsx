import { useEffect, useRef, useState } from "react";
import { Megaphone, Users, ArrowDown, FileText, File as FileIcon, Download, Search as SearchIcon, X, Loader2, Check, CheckCheck, Eye } from "lucide-react";
import type { ChatMessage, Conversation, ChatAttachment, SeenEntry } from "./chat";
import { authenticatedApiUrl } from "./api";
import { chatApi } from "./chat";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// ----- Basic helpers -----
export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(/[.\s_-]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
}

export function timeShort(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const diff = (now.getTime() - d.getTime()) / 86400000;
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString();
}

export function convTitle(c: Conversation, meUsername?: string): string {
  if (c.name) return c.name;
  if (c.type === "dm") {
    const other = c.members.find((m) => m.username !== meUsername);
    return other?.fullName ?? "Conversation";
  }
  return c.members.map((m) => m.fullName).slice(0, 3).join(", ") || "Groupe";
}

// ----- Color hashing for avatars -----
const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-blue-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-blue-600",
  "from-lime-500 to-emerald-500",
];
export function colorForName(s?: string | null): string {
  if (!s) return GRADIENTS[0];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

// ----- Day labels -----
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOfDay(now) - startOfDay(d)) / 86400000;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}
export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ----- Avatars -----
export function ConvAvatar({
  conv, meUsername, size = 40,
}: { conv: Conversation; meUsername?: string; size?: number }) {
  const cls = `rounded-full flex items-center justify-center font-semibold text-white shrink-0 bg-gradient-to-br ${
    conv.type === "broadcast" ? "from-amber-500 to-orange-600"
      : conv.type === "group" ? "from-indigo-500 to-purple-600"
      : colorForName(conv.members.find((m) => m.username !== meUsername)?.username ?? conv.id)
  }`;
  const style = { height: size, width: size, fontSize: Math.max(10, size * 0.34) };
  const Icon = conv.type === "broadcast" ? Megaphone : conv.type === "group" ? Users : null;
  return (
    <div className={cls} style={style}>
      {Icon ? <Icon style={{ height: size * 0.45, width: size * 0.45 }} /> : initials(convTitle(conv, meUsername))}
    </div>
  );
}

export function UserAvatar({ name, username, size = 28 }: { name?: string | null; username?: string | null; size?: number }) {
  const cls = `rounded-full flex items-center justify-center font-semibold text-white shrink-0 bg-gradient-to-br ${colorForName(username || name)}`;
  return (
    <div className={cls} style={{ height: size, width: size, fontSize: Math.max(9, size * 0.4) }}>
      {initials(name || username)}
    </div>
  );
}

// ----- Attachment bubble -----
export function AttachmentBubble({ att, mine }: { att: ChatAttachment; mine: boolean }) {
  const isImage = att.mimeType?.startsWith("image/");
  const isPdf = att.mimeType === "application/pdf";
  const url = authenticatedApiUrl(att.url, isImage || isPdf ? { inline: 1 } : undefined);
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={`max-w-full block rounded-2xl overflow-hidden border border-border ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
        <img src={url} alt={att.filename} className="block max-h-64 w-auto object-cover" loading="lazy" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`max-w-full flex items-center gap-2 px-3 py-2 rounded-2xl text-sm border ${mine ? "bg-primary text-primary-foreground border-primary rounded-br-md" : "bg-muted border-border rounded-bl-md"}`}>
      <div className="h-8 w-8 rounded-md bg-background/40 flex items-center justify-center shrink-0">
        {isPdf ? <FileText className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium">{att.filename}</div>
        <div className="text-[10px] opacity-70">{(att.sizeBytes / 1024).toFixed(1)} Ko</div>
      </div>
      <Download className="h-4 w-4 opacity-70" />
    </a>
  );
}

// ----- Message grouping -----
const GROUP_GAP_MS = 5 * 60 * 1000;
export function isSameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (a.isSystem || b.isSystem) return false;
  if (a.sender !== b.sender) return false;
  return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= GROUP_GAP_MS;
}
export function isSameDay(a: string, b: string): boolean {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

// ----- Scroll-to-bottom button -----
export function ScrollToBottomButton({
  show, onClick, unread,
}: { show: boolean; onClick: () => void; unread?: number }) {
  if (!show) return null;
  return (
    <button
      onClick={onClick}
      className="absolute bottom-3 right-3 z-10 h-9 w-9 rounded-full bg-card border border-border shadow-lg flex items-center justify-center hover:bg-muted/70 transition"
      title="Aller au dernier message"
    >
      <ArrowDown className="h-4 w-4" />
      {!!unread && unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

// ----- Day separator -----
export function DaySeparator({ iso }: { iso: string }) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-2 py-0.5 bg-muted/40 rounded-full">
        {formatDayLabel(iso)}
      </div>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ----- Shared MessageList -----
export function MessageList({
  conv, messages, meUsername, highlightedId, highlightTerm,
}: { conv: Conversation; messages: ChatMessage[]; meUsername?: string; highlightedId?: string | null; highlightTerm?: string }) {
  // Total recipients (everyone except the sender) used to compute "Vu par X / Y" ratios.
  const recipientCount = Math.max(0, conv.members.length - 1);
  return (
    <div className="space-y-0">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const showDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
        if (m.isSystem) {
          return (
            <div key={m.id}>
              {showDay && <DaySeparator iso={m.createdAt} />}
              <div className="text-center text-[11px] text-muted-foreground py-1.5">{m.body}</div>
            </div>
          );
        }
        const mine = m.sender === meUsername;
        const groupedWithPrev = !!prev && !showDay && isSameGroup(prev, m);
        const groupedWithNext = !!next && isSameDay(m.createdAt, next.createdAt) && isSameGroup(m, next);
        const isGroup = conv.type !== "dm";
        const showName = !mine && isGroup && !groupedWithPrev;
        const showAvatar = !mine && isGroup && !groupedWithNext;
        const showTime = !groupedWithNext;
        const bubbleRadius = mine
          ? `rounded-2xl ${groupedWithPrev ? "rounded-tr-md" : ""} ${groupedWithNext ? "rounded-br-md" : ""}`
          : `rounded-2xl ${groupedWithPrev ? "rounded-tl-md" : ""} ${groupedWithNext ? "rounded-bl-md" : ""}`;
        const isHighlighted = highlightedId === m.id;
        // Show seen indicator on the last message of each "mine" group (last in run + last from me overall flows naturally).
        const showSeen = mine && !groupedWithNext;
        return (
          <div key={m.id} data-message-id={m.id}>
            {showDay && <DaySeparator iso={m.createdAt} />}
            <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""} ${groupedWithPrev ? "mt-0.5" : "mt-2"}`}>
              {!mine && isGroup && (
                <div className="w-7 shrink-0">
                  {showAvatar && <UserAvatar name={m.senderName} username={m.sender} size={28} />}
                </div>
              )}
              <div className={`flex flex-col max-w-[78%] sm:max-w-[68%] ${mine ? "items-end" : "items-start"}`}>
                {showName && (
                  <div className="text-[11px] text-muted-foreground mb-0.5 px-2 font-medium">{m.senderName}</div>
                )}
                {m.attachment && <AttachmentBubble att={m.attachment} mine={mine} />}
                {m.body && (
                  <div className={`px-3 py-1.5 text-sm break-words shadow-sm transition-shadow ${bubbleRadius} ${
                    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  } ${m.attachment ? "mt-1" : ""} ${isHighlighted ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse" : ""}`}>
                    {highlightTerm ? <Highlighted text={m.body} term={highlightTerm} /> : m.body}
                  </div>
                )}
                {showTime && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1.5">
                    <span>{timeOfDay(m.createdAt)}</span>
                    {showSeen && (
                      <SeenByIndicator
                        seenBy={m.seenBy ?? []}
                        recipientCount={recipientCount}
                        isDm={conv.type === "dm"}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----- Seen-by indicator (read receipts) -----
export function SeenByIndicator({
  seenBy, recipientCount, isDm,
}: { seenBy: SeenEntry[]; recipientCount: number; isDm: boolean }) {
  const count = seenBy.length;
  const allSeen = recipientCount > 0 && count >= recipientCount;
  const Icon = count === 0 ? Check : allSeen ? CheckCheck : Eye;
  const label = count === 0
    ? "Envoyé"
    : isDm
      ? "Vu"
      : allSeen
        ? `Vu par tous (${count})`
        : `Vu par ${count}${recipientCount > 0 ? `/${recipientCount}` : ""}`;
  const tone = count === 0
    ? "text-muted-foreground"
    : allSeen
      ? "text-primary"
      : "text-foreground/70";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={count === 0}
          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition ${tone} ${count > 0 ? "hover:bg-muted/60 cursor-pointer" : "cursor-default"}`}
          title={count > 0 ? "Voir qui a lu ce message" : "Pas encore lu"}
          onClick={(e) => { if (count === 0) e.preventDefault(); }}
        >
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </button>
      </PopoverTrigger>
      {count > 0 && (
        <PopoverContent align="end" className="w-64 p-0">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-xs font-semibold">Vu par</div>
            <div className="text-[11px] text-muted-foreground">
              {count} {count > 1 ? "personnes" : "personne"}
              {recipientCount > 0 ? ` sur ${recipientCount}` : ""}
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {seenBy.map((s) => (
              <div key={s.username} className="flex items-center gap-2 px-3 py-1.5">
                <UserAvatar name={s.fullName} username={s.username} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{s.fullName || s.username}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {formatDayLabel(s.readAt)} · {timeOfDay(s.readAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// ----- Highlight matching substrings -----
function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(term)})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-amber-300/80 text-foreground rounded px-0.5">{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  );
}

// ----- Build a snippet around the first match -----
function snippet(body: string, term: string, radius = 40): string {
  if (!term) return body.slice(0, radius * 2);
  const idx = body.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return body.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + term.length + radius);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

// ----- Message search panel -----
export function MessageSearchPanel({
  conv, meUsername, onClose, onJump,
}: {
  conv: Conversation;
  meUsername?: string;
  onClose: () => void;
  onJump: (msg: ChatMessage) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [debounced, setDebounced] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) { setResults([]); return; }
    setLoading(true);
    chatApi.search(conv.id, debounced).then((r) => {
      if (!cancelled) setResults(r.results);
    }).catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, conv.id]);

  return (
    <div className="border-b border-border bg-card">
      <div className="flex items-center gap-1.5 p-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Rechercher dans la conversation…"
            className="w-full h-9 pl-8 pr-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Fermer">
          <X className="h-4 w-4" />
        </button>
      </div>
      {debounced.length >= 2 && (
        <div className="max-h-72 overflow-y-auto border-t border-border bg-background">
          {loading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin inline mr-1" /> Recherche…
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">Aucun résultat</div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[11px] text-muted-foreground bg-muted/30 sticky top-0">
                {results.length} résultat{results.length > 1 ? "s" : ""}
              </div>
              {results.map((m) => {
                const isMe = m.sender === meUsername;
                return (
                  <button
                    key={m.id}
                    onClick={() => onJump(m)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b border-border/50 flex items-start gap-2"
                  >
                    <UserAvatar name={m.senderName} username={m.sender} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="font-semibold truncate">{isMe ? "Vous" : m.senderName}</span>
                        <span className="text-muted-foreground">{timeOfDay(m.createdAt)} · {formatDayLabel(m.createdAt)}</span>
                      </div>
                      <div className="text-xs text-foreground mt-0.5 line-clamp-2">
                        <Highlighted text={snippet(m.body, debounced)} term={debounced} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
      {debounced.length > 0 && debounced.length < 2 && (
        <div className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
          Tapez au moins 2 caractères…
        </div>
      )}
    </div>
  );
}

// ----- Hook used by chat panes to manage jump-to-message highlight -----
export function useJumpToMessage(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const jump = (messageId: string) => {
    setHighlightedId(messageId);
    // Defer to next tick so DOM has rendered the (possibly new) message list.
    setTimeout(() => {
      const root = scrollRef.current;
      if (!root) return;
      const el = root.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    // Clear highlight after a few seconds.
    setTimeout(() => setHighlightedId((cur) => (cur === messageId ? null : cur)), 3500);
  };
  return { highlightedId, jump };
}

// ----- Scroll hook -----
export function useChatScroll(deps: { messages: ChatMessage[]; convId: string; minimized?: boolean; loadOlder: () => Promise<number>; hasMore: boolean; loadingOlder: boolean; }) {
  const { messages, convId, minimized, loadOlder, hasMore, loadingOlder } = deps;
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevScrollHeightRef = useRef<number>(0);
  const stickToBottomRef = useRef<boolean>(true);
  const [awayFromBottom, setAwayFromBottom] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || minimized) return;
    const firstId = messages[0]?.id ?? null;
    if (prevFirstIdRef.current && firstId !== prevFirstIdRef.current) {
      const delta = el.scrollHeight - prevScrollHeightRef.current;
      el.scrollTop = el.scrollTop + delta;
    } else if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevFirstIdRef.current = firstId;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [messages, minimized]);

  useEffect(() => {
    if (minimized) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      stickToBottomRef.current = true;
      setAwayFromBottom(false);
    }
  }, [convId, minimized]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 80;
    stickToBottomRef.current = near;
    setAwayFromBottom(!near && distanceFromBottom > 200);
    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      prevScrollHeightRef.current = el.scrollHeight;
      void loadOlder();
    }
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottomRef.current = true;
    setAwayFromBottom(false);
  };

  return { scrollRef, onScroll, scrollToBottom, awayFromBottom };
}
