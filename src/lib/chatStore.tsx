import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { chatApi, type ChatMessage, type Conversation } from "./chat";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 5000;
const ACTIVE_POLL_INTERVAL_MS = 2500;
const MAX_OPEN_WINDOWS = 3;
const PAGE_SIZE = 30;

type Store = {
  conversations: Conversation[];
  totalUnread: number;
  openIds: string[];
  minimized: Record<string, boolean>;
  launcherOpen: boolean;
  loading: boolean;
  setLauncherOpen: (b: boolean) => void;
  openConversation: (id: string, opts?: { silent?: boolean; minimized?: boolean }) => void;
  closeConversation: (id: string) => void;
  toggleMinimize: (id: string) => void;
  refreshConversations: () => Promise<void>;
  loadMessages: (id: string) => Promise<ChatMessage[]>;
  loadOlder: (id: string) => Promise<number>;
  send: (id: string, body: string) => Promise<void>;
  uploadFile: (id: string, file: File, caption?: string) => Promise<void>;
  markRead: (id: string) => Promise<void>;
  setMute: (id: string, muted: boolean) => Promise<void>;
  loadAround: (id: string, targetIso: string) => Promise<void>;
  messagesByConv: Record<string, ChatMessage[]>;
  hasMore: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
};

const ChatContext = createContext<Store | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [minimized, setMinimized] = useState<Record<string, boolean>>({});
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [hasMore, setHasMore] = useState<Record<string, boolean>>({});
  const [loadingOlder, setLoadingOlder] = useState<Record<string, boolean>>({});
  const messagesRef = useRef<Record<string, ChatMessage[]>>({});
  const hasMoreRef = useRef<Record<string, boolean>>({});
  const loadingOlderRef = useRef<Record<string, boolean>>({});
  const lastMsgAtRef = useRef<Record<string, string | null>>({});
  const bootstrappedRef = useRef(false);
  const notifiedAtRef = useRef<Record<string, string>>({});
  const conversationsRef = useRef<Conversation[]>([]);
  const openIdsRef = useRef<string[]>([]);
  const minimizedRef = useRef<Record<string, boolean>>({});
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { openIdsRef.current = openIds; }, [openIds]);
  useEffect(() => { minimizedRef.current = minimized; }, [minimized]);

  const refreshConversations = useCallback(async () => {
    if (!user) return;
    try {
      const r = await chatApi.conversations();
      setConversations(r.conversations);
    } catch { /* ignore */ }
  }, [user]);

  const loadMessages = useCallback(async (id: string): Promise<ChatMessage[]> => {
    const r = await chatApi.messages(id, undefined, PAGE_SIZE);
    messagesRef.current[id] = r.messages;
    setMessagesByConv((prev) => ({ ...prev, [id]: r.messages }));
    const more = r.messages.length >= PAGE_SIZE;
    hasMoreRef.current[id] = more;
    setHasMore((prev) => ({ ...prev, [id]: more }));
    if (r.messages.length) lastMsgAtRef.current[id] = r.messages[r.messages.length - 1].createdAt;
    return r.messages;
  }, []);

  const loadOlder = useCallback(async (id: string): Promise<number> => {
    const current = messagesRef.current[id] ?? [];
    if (current.length === 0 || hasMoreRef.current[id] === false || loadingOlderRef.current[id]) return 0;
    loadingOlderRef.current[id] = true;
    setLoadingOlder((p) => ({ ...p, [id]: true }));
    try {
      const before = current[0].createdAt;
      const r = await chatApi.messages(id, before, PAGE_SIZE);
      const seen = new Set(current.map((m) => m.id));
      const fresh = r.messages.filter((m) => !seen.has(m.id));
      const merged = [...fresh, ...current];
      messagesRef.current[id] = merged;
      setMessagesByConv((prev) => ({ ...prev, [id]: merged }));
      const more = r.messages.length >= PAGE_SIZE;
      hasMoreRef.current[id] = more;
      setHasMore((prev) => ({ ...prev, [id]: more }));
      return fresh.length;
    } catch { return 0; }
    finally {
      loadingOlderRef.current[id] = false;
      setLoadingOlder((p) => ({ ...p, [id]: false }));
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try { await chatApi.markRead(id); } catch {}
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0, lastReadAt: new Date().toISOString() } : c)));
  }, []);

  const openConversation = useCallback((id: string, opts?: { silent?: boolean; minimized?: boolean }) => {
    setOpenIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      return next.slice(-MAX_OPEN_WINDOWS);
    });
    setMinimized((m) => ({ ...m, [id]: !!opts?.minimized }));
    if (!opts?.silent) setLauncherOpen(false);
    void loadMessages(id).then(() => {
      if (!opts?.silent) markRead(id);
    });
  }, [loadMessages, markRead]);

  const closeConversation = useCallback((id: string) => {
    setOpenIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const toggleMinimize = useCallback((id: string) => {
    setMinimized((m) => ({ ...m, [id]: !m[id] }));
  }, []);

  const ingestMessage = useCallback((id: string, msg: ChatMessage) => {
    const list = messagesRef.current[id] ?? [];
    const merged = [...list, msg];
    messagesRef.current[id] = merged;
    setMessagesByConv((prev) => ({ ...prev, [id]: merged }));
    lastMsgAtRef.current[id] = msg.createdAt;
    const preview = msg.body || (msg.attachment ? `📎 ${msg.attachment.filename}` : "");
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, lastBody: preview, lastSender: msg.sender, lastMessageAt: msg.createdAt } : c)));
  }, []);

  const send = useCallback(async (id: string, body: string) => {
    const r = await chatApi.send(id, body);
    ingestMessage(id, r.message);
  }, [ingestMessage]);

  const uploadFile = useCallback(async (id: string, file: File, caption = "") => {
    const r = await chatApi.upload(id, file, caption);
    ingestMessage(id, r.message);
  }, [ingestMessage]);

  const setMute = useCallback(async (id: string, muted: boolean) => {
    await chatApi.setMute(id, muted);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, muted } : c)));
  }, []);

  // Re-anchor message list around a target message (for search jump).
  // We fetch a window ending just after the target so it appears in the list.
  const loadAround = useCallback(async (id: string, targetIso: string) => {
    const before = new Date(new Date(targetIso).getTime() + 1).toISOString();
    const r = await chatApi.messages(id, before, 80);
    messagesRef.current[id] = r.messages;
    setMessagesByConv((prev) => ({ ...prev, [id]: r.messages }));
    const more = r.messages.length >= 80;
    hasMoreRef.current[id] = more;
    setHasMore((prev) => ({ ...prev, [id]: more }));
    if (r.messages.length) lastMsgAtRef.current[id] = r.messages[r.messages.length - 1].createdAt;
  }, []);

  // Initial + interval polling
  useEffect(() => {
    if (!user) return;
    // Request browser notification permission once
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      try { void Notification.requestPermission(); } catch {}
    }
    let cancelled = false;
    setLoading(true);
    refreshConversations().finally(() => {
      if (cancelled) return;
      setLoading(false);
      // Seed the "last seen" map so we don't notify on initial load
      setConversations((prev) => {
        for (const c of prev) {
          if (c.lastMessageAt) notifiedAtRef.current[c.id] = c.lastMessageAt;
        }
        bootstrappedRef.current = true;
        return prev;
      });
    });

    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const p = await chatApi.poll();
        if (cancelled) return;
        setTotalUnread(p.totalUnread);
        // Detect changes per conversation
        let needsRefresh = false;
        const openSet = new Set(openIdsRef.current);
        const currentConvs = conversationsRef.current;
        const currentMinimized = minimizedRef.current;
        for (const c of p.conversations) {
          const known = currentConvs.find((x) => x.id === c.id);
          if (!known || known.lastMessageAt !== c.lastMessageAt) needsRefresh = true;
          if (openSet.has(c.id) && c.lastMessageAt && lastMsgAtRef.current[c.id] !== c.lastMessageAt) {
            // Reload messages for the open window
            void loadMessages(c.id).then(() => {
              if (!currentMinimized[c.id]) void markRead(c.id);
            });
          }
        }
        if (needsRefresh) {
          await refreshConversations();
          // After refresh, surface notifications for new incoming messages
          if (bootstrappedRef.current) {
            try {
              const fresh = { conversations: conversationsRef.current };
              for (const conv of fresh.conversations) {
                const seen = notifiedAtRef.current[conv.id];
                if (!conv.lastMessageAt) continue;
                if (seen === conv.lastMessageAt) continue;
                notifiedAtRef.current[conv.id] = conv.lastMessageAt;
                const isMine = conv.lastSender && user && conv.lastSender === user.username;
                if (isMine || conv.muted) continue;
                const isOpen = openSet.has(conv.id) && !currentMinimized[conv.id];
                const title = conv.name
                  ? conv.name
                  : (conv.members.find((m) => m.username !== user?.username)?.fullName ?? "Nouveau message");
                const senderMember = conv.members.find((m) => m.username === conv.lastSender);
                const senderLabel = senderMember?.fullName ?? conv.lastSender ?? "";
                const isBroadcast = conv.type === "broadcast";
                const isAdminGroup = conv.type === "group" && senderMember?.role === "admin";
                const preview = conv.lastBody || "📎 Pièce jointe";
                if (!isOpen) {
                  const shouldExpand = isBroadcast || isAdminGroup || conv.type === "dm";
                  openConversation(conv.id, { silent: true, minimized: !shouldExpand });
                }
                const toastTitle = isBroadcast ? `📢 Annonce — ${title}` : (conv.type === "group" ? `👥 ${title}` : title);
                toast.message(toastTitle, {
                  description: senderLabel ? `${senderLabel}: ${preview}` : preview,
                  action: { label: "Ouvrir", onClick: () => openConversation(conv.id) },
                });
                if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                  try {
                    const n = new Notification(toastTitle, { body: senderLabel ? `${senderLabel}: ${preview}` : preview, tag: conv.id });
                    n.onclick = () => { try { window.focus(); } catch {} openConversation(conv.id); n.close(); };
                  } catch {}
                }
              }
            } catch {}
          }
        }
      } catch {}
      const interval = openIdsRef.current.length > 0 ? ACTIVE_POLL_INTERVAL_MS : POLL_INTERVAL_MS;
      timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const value: Store = useMemo(() => ({
    conversations, totalUnread, openIds, minimized, launcherOpen, loading,
    setLauncherOpen, openConversation, closeConversation, toggleMinimize,
    refreshConversations, loadMessages, loadOlder, send, uploadFile, markRead, setMute, loadAround,
    messagesByConv, hasMore, loadingOlder,
  }), [conversations, totalUnread, openIds, minimized, launcherOpen, loading,
       openConversation, closeConversation, toggleMinimize, refreshConversations,
       loadMessages, loadOlder, send, uploadFile, markRead, setMute, loadAround, messagesByConv, hasMore, loadingOlder]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const c = useContext(ChatContext);
  if (!c) throw new Error("useChat must be used inside ChatProvider");
  return c;
}
