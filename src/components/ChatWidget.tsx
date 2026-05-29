import { useEffect, useMemo, useRef, useState } from "react";
import {
  MessageCircle, X, Minus, Search, Plus, Megaphone, BellOff, Bell, Users, Send,
  MoreVertical, LogOut, UserPlus, Paperclip, FileText, Image as ImageIcon,
  File as FileIcon, Loader2, Shield, ShieldOff, Lock, Unlock, Settings, Inbox,
  Maximize2, ExternalLink, CheckCheck, Search as SearchIcon,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useChat } from "@/lib/chatStore";
import { useAuth } from "@/lib/auth";
import { chatApi, type ChatUser, type Conversation } from "@/lib/chat";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  initials, timeShort, convTitle,
  ConvAvatar, MessageList, ScrollToBottomButton, useChatScroll, AttachmentBubble,
  MessageSearchPanel, useJumpToMessage,
} from "@/lib/chatUi";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

// Re-exports for backwards compatibility (messaging.tsx imports from here)
export { initials, timeShort, convTitle, AttachmentBubble };

export function ChatWidget() {
  const { user } = useAuth();
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/messaging")) return null;
  if (!user) return null;
  return <ChatWidgetInner />;
}

type LauncherTab = "all" | "unread" | "groups";

function ChatWidgetInner() {
  const chat = useChat();
  const { user } = useAuth();
  const isAdmin = user?.role === "Administrateur";
  const isManager = user?.role === "Manager";

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<LauncherTab>("all");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  // Persisted "hide the launcher entirely" — user can dismiss via X and reopen via the sticky tab.
  const [launcherHidden, setLauncherHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("chat:launcherHidden") === "1";
  });
  const hideLauncher = () => {
    setLauncherHidden(true);
    chat.setLauncherOpen(false);
    try { window.localStorage.setItem("chat:launcherHidden", "1"); } catch {}
  };
  const showLauncher = () => {
    setLauncherHidden(false);
    try { window.localStorage.removeItem("chat:launcherHidden"); } catch {}
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = chat.conversations;
    if (tab === "unread") list = list.filter((c) => c.unread > 0 && !c.muted);
    else if (tab === "groups") list = list.filter((c) => c.type === "group" || c.type === "broadcast");
    if (q) {
      list = list.filter((c) =>
        convTitle(c, user?.username).toLowerCase().includes(q) ||
        c.members.some((m) => m.fullName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
      );
    }
    return list;
  }, [chat.conversations, search, tab, user?.username]);

  const unreadCount = chat.conversations.filter((c) => c.unread > 0 && !c.muted).length;
  const groupsCount = chat.conversations.filter((c) => c.type === "group" || c.type === "broadcast").length;

  return (
    <>
      {/* Sticky reopen tab — only when the user dismissed the launcher */}
      {launcherHidden && (
        <button
          onClick={showLauncher}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 h-12 w-9 rounded-l-xl bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:w-11 transition-all"
          title="Afficher la messagerie"
          aria-label={`Afficher la messagerie${chat.totalUnread ? `, ${chat.totalUnread} non lus` : ""}`}
        >
          <MessageCircle className="h-5 w-5" />
          {chat.totalUnread > 0 && (
            <span className="absolute -top-1 -left-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center ring-2 ring-background">
              {chat.totalUnread > 99 ? "99+" : chat.totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Launcher button + dismiss X */}
      {!launcherHidden && (
        <div className="fixed bottom-5 right-5 z-40">
          <button
            onClick={() => chat.setLauncherOpen(!chat.launcherOpen)}
            className="relative h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            title="Messages"
            aria-label={`Messages${chat.totalUnread ? `, ${chat.totalUnread} non lus` : ""}`}
          >
            <MessageCircle className="h-6 w-6" />
            {chat.totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-semibold flex items-center justify-center ring-2 ring-background animate-in fade-in zoom-in-75">
                {chat.totalUnread > 99 ? "99+" : chat.totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={hideLauncher}
            className="absolute -top-1.5 -left-1.5 h-6 w-6 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
            title="Masquer la messagerie"
            aria-label="Masquer la messagerie"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Launcher panel */}
      {chat.launcherOpen && !launcherHidden && (
        <div
          className="fixed bottom-24 right-5 z-40 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2"
          style={{ maxHeight: "min(75vh, 640px)" }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-primary" /> Messagerie
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {chat.totalUnread > 0 ? `${chat.totalUnread} message${chat.totalUnread > 1 ? "s" : ""} non lu${chat.totalUnread > 1 ? "s" : ""}` : "Tout est à jour"}
              </div>
            </div>
            <div className="flex gap-0.5">
              <Link to="/messaging" onClick={() => chat.setLauncherOpen(false)} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Vue plein écran">
                <ExternalLink className="h-4 w-4" />
              </Link>
              <button onClick={() => setNewDmOpen(true)} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Nouveau message">
                <Plus className="h-4 w-4" />
              </button>
              {(isAdmin || isManager) && (
                <button onClick={() => setNewGroupOpen(true)} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Nouveau groupe">
                  <Users className="h-4 w-4" />
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setBroadcastOpen(true)} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Annonce">
                  <Megaphone className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => chat.setLauncherOpen(false)} className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center" title="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Search + tabs */}
          <div className="px-2 pt-2 border-b border-border bg-card">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher..." className="pl-8 h-9" />
            </div>
            <div className="flex gap-1 mt-2 mb-1.5">
              {([
                ["all", "Toutes", chat.conversations.length],
                ["unread", "Non lues", unreadCount],
                ["groups", "Groupes", groupsCount],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  onClick={() => setTab(key as LauncherTab)}
                  className={`flex-1 h-7 text-[12px] rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
                    tab === key ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span className={`text-[10px] px-1 rounded-full ${tab === key ? "bg-primary-foreground/20" : "bg-muted"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <ScrollArea className="flex-1">
            {filtered.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <div className="text-sm font-medium">Aucune conversation</div>
                <div className="text-xs text-muted-foreground mb-3">
                  {tab === "unread" ? "Tout est à jour 🎉" : "Démarrez une nouvelle discussion"}
                </div>
                {tab !== "unread" && (
                  <Button size="sm" onClick={() => setNewDmOpen(true)}>
                    <Plus className="h-4 w-4 mr-1.5" /> Nouveau message
                  </Button>
                )}
              </div>
            ) : filtered.map((c) => (
              <ConversationListItem key={c.id} conv={c} meUsername={user?.username} onClick={() => chat.openConversation(c.id)} />
            ))}
          </ScrollArea>
        </div>
      )}

      {/* Open chat windows */}
      <div className="fixed bottom-5 right-24 z-40 flex flex-row-reverse items-end gap-3 pointer-events-none">
        {chat.openIds.map((id) => {
          const conv = chat.conversations.find((c) => c.id === id);
          if (!conv) return null;
          return <div key={id} className="pointer-events-auto"><ChatWindow conv={conv} /></div>;
        })}
      </div>

      <NewDmDialog open={newDmOpen} onOpenChange={setNewDmOpen} />
      <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </>
  );
}

function ConversationListItem({ conv, meUsername, onClick, active }: { conv: Conversation; meUsername?: string; onClick: () => void; active?: boolean }) {
  const isUnread = conv.unread > 0 && !conv.muted;
  const senderLabel = conv.lastSender && conv.lastSender !== meUsername
    ? (conv.members.find((m) => m.username === conv.lastSender)?.fullName?.split(" ")[0] ?? conv.lastSender) + ": "
    : conv.lastSender === meUsername ? "Vous: " : "";
  const typeBadge = conv.type === "broadcast" ? "Annonce" : conv.type === "group" ? "Groupe" : null;
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 text-left ${active ? "bg-muted/60" : ""}`}
    >
      <ConvAvatar conv={conv} meUsername={meUsername} size={42} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className={`text-sm truncate ${isUnread ? "font-semibold" : "font-medium"}`}>{convTitle(conv, meUsername)}</div>
          {typeBadge && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase tracking-wide shrink-0">{typeBadge}</span>
          )}
          {conv.muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
          <div className="ml-auto text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{timeShort(conv.lastMessageAt)}</div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`text-xs truncate flex-1 ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
            {senderLabel}{conv.lastBody ?? <span className="italic">Aucun message</span>}
          </div>
          {isUnread && (
            <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center shrink-0">
              {conv.unread > 99 ? "99+" : conv.unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatWindow({ conv }: { conv: Conversation }) {
  const chat = useChat();
  const { user } = useAuth();
  const minimized = !!chat.minimized[conv.id];
  const messages = chat.messagesByConv[conv.id] ?? [];
  const hasMore = chat.hasMore[conv.id] !== false;
  const loadingOlder = !!chat.loadingOlder[conv.id];
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { scrollRef, onScroll, scrollToBottom, awayFromBottom } = useChatScroll({
    messages, convId: conv.id, minimized,
    loadOlder: () => chat.loadOlder(conv.id), hasMore, loadingOlder,
  });
  const { highlightedId, jump } = useJumpToMessage(scrollRef);
  const handleJump = async (msg: { id: string; createdAt: string }) => {
    const inList = messages.some((m) => m.id === msg.id);
    if (!inList) { try { await chat.loadAround(conv.id, msg.createdAt); } catch {} }
    jump(msg.id);
  };

  const submit = async () => {
    const body = text.trim();
    if ((!body && !pendingFile) || sending) return;
    setSending(true);
    try {
      if (pendingFile) {
        if (pendingFile.size > 20 * 1024 * 1024) throw new Error("Fichier trop volumineux (max 20 Mo)");
        await chat.uploadFile(conv.id, pendingFile, body);
        setPendingFile(null);
      } else {
        await chat.send(conv.id, body);
      }
      setText("");
    } catch (e: any) { toast.error(e?.message ?? "Erreur d'envoi"); }
    finally { setSending(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const onPickFile = (files: FileList | File[] | null) => {
    if (!files) return;
    const f = Array.from(files)[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 20 Mo)"); return; }
    setPendingFile(f);
  };

  const title = convTitle(conv, user?.username);
  const meRole = conv.members.find((m) => m.username === user?.username)?.role;
  const isGroupAdmin = meRole === "admin" || user?.role === "Administrateur";
  const canPost = conv.type === "dm" || conv.postPolicy === "all" || isGroupAdmin;
  const subtitle = conv.type === "dm"
    ? "Message direct"
    : conv.type === "broadcast" ? `Annonce · ${conv.members.length} destinataires`
    : `${conv.members.length} membres${conv.postPolicy === "admins" ? " · admins seulement" : ""}`;

  return (
    <div
      className="w-[360px] max-w-[calc(100vw-2rem)] rounded-t-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-2"
      style={{ height: minimized ? 52 : 540 }}
    >
      {/* Header */}
      <div
        className="h-13 px-3 py-2 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-2 cursor-pointer"
        onClick={() => chat.toggleMinimize(conv.id)}
      >
        <ConvAvatar conv={conv} meUsername={user?.username} size={34} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
            {conv.type === "dm" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />}
            {subtitle}
          </div>
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSearchOpen((v) => !v)}
            className={`h-7 w-7 rounded-md inline-flex items-center justify-center ${searchOpen ? "bg-background text-primary" : "hover:bg-background"}`}
            title="Rechercher"
          >
            <SearchIcon className="h-3.5 w-3.5" />
          </button>
          <Link to="/messaging" className="h-7 w-7 rounded-md hover:bg-background inline-flex items-center justify-center" title="Plein écran">
            <Maximize2 className="h-3.5 w-3.5" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-md hover:bg-background inline-flex items-center justify-center"><MoreVertical className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => chat.markRead(conv.id)}>
                <CheckCheck className="h-4 w-4 mr-2" /> Marquer comme lu
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => chat.setMute(conv.id, !conv.muted)}>
                {conv.muted ? <><Bell className="h-4 w-4 mr-2" /> Réactiver les notifications</> : <><BellOff className="h-4 w-4 mr-2" /> Mettre en sourdine</>}
              </DropdownMenuItem>
              {conv.type !== "dm" && isGroupAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4 mr-2" /> Ajouter des membres</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setManageOpen(true)}><Settings className="h-4 w-4 mr-2" /> Gérer le groupe</DropdownMenuItem>
                  <DropdownMenuItem onClick={async () => {
                    const next = conv.postPolicy === "admins" ? "all" : "admins";
                    try { await chatApi.setPostPolicy(conv.id, next); await chat.refreshConversations(); toast.success(next === "admins" ? "Seuls les admins peuvent poster" : "Tous les membres peuvent poster"); }
                    catch (e: any) { toast.error(e?.message); }
                  }}>
                    {conv.postPolicy === "admins" ? <><Unlock className="h-4 w-4 mr-2" /> Autoriser tout le monde</> : <><Lock className="h-4 w-4 mr-2" /> Restreindre aux admins</>}
                  </DropdownMenuItem>
                </>
              )}
              {conv.type !== "dm" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!(await confirmDialog({ title: "Confirmer l'action", description: "Quitter cette conversation ?", tone: "warning", confirmText: "Continuer" }))) return;
                      try { await chatApi.leave(conv.id); chat.closeConversation(conv.id); chat.refreshConversations(); }
                      catch (e: any) { toast.error(e?.message); }
                    }}
                    className="text-destructive"
                  ><LogOut className="h-4 w-4 mr-2" /> Quitter</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={(e) => { e.stopPropagation(); chat.toggleMinimize(conv.id); }} className="h-7 w-7 rounded-md hover:bg-background inline-flex items-center justify-center" title="Réduire">
            <Minus className="h-4 w-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); chat.closeConversation(conv.id); }} className="h-7 w-7 rounded-md hover:bg-background inline-flex items-center justify-center" title="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {searchOpen && (
            <MessageSearchPanel
              conv={conv}
              meUsername={user?.username}
              onClose={() => setSearchOpen(false)}
              onJump={(m) => handleJump(m)}
            />
          )}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onPickFile(e.dataTransfer.files); }}
            className={`relative flex-1 overflow-y-auto px-3 py-2 bg-background ${dragOver ? "ring-2 ring-inset ring-primary/40" : ""}`}
          >
            {dragOver && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 pointer-events-none">
                <div className="text-sm font-medium text-primary px-3 py-1.5 bg-card rounded-md shadow-md">Déposer pour envoyer</div>
              </div>
            )}
            {loadingOlder && <div className="text-center text-[11px] text-muted-foreground py-2"><Loader2 className="h-3 w-3 inline animate-spin mr-1" /> Chargement…</div>}
            {!hasMore && messages.length > 0 && (
              <div className="text-center text-[10px] text-muted-foreground/70 py-1">Début de la conversation</div>
            )}
            {messages.length === 0 && !loadingOlder && (
              <div className="text-center py-12">
                <div className="text-3xl mb-2">👋</div>
                <div className="text-sm font-medium">Aucun message</div>
                <div className="text-xs text-muted-foreground">Soyez le premier à écrire !</div>
              </div>
            )}
            <MessageList conv={conv} messages={messages} meUsername={user?.username} highlightedId={highlightedId} />
            <ScrollToBottomButton show={awayFromBottom} onClick={scrollToBottom} unread={conv.unread} />
          </div>

          {pendingFile && (
            <div className="px-2 pt-2 flex items-center gap-2 border-t border-border bg-muted/30">
              <div className="h-9 w-9 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                {pendingFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4" /> : pendingFile.type === "application/pdf" ? <FileText className="h-4 w-4" /> : <FileIcon className="h-4 w-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{pendingFile.name}</div>
                <div className="text-[10px] text-muted-foreground">{(pendingFile.size / 1024).toFixed(1)} Ko</div>
              </div>
              <button type="button" onClick={() => setPendingFile(null)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-background"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {!canPost ? (
            <div className="p-3 border-t border-border bg-muted/30 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Lock className="h-3.5 w-3.5" /> Seuls les administrateurs peuvent poster ici.
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="p-2 border-t border-border bg-card flex items-end gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={(e) => onPickFile(e.target.files)}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending} title="Joindre un fichier">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder={pendingFile ? "Ajouter une légende…" : "Écrire un message..."}
                rows={1}
                className="min-h-9 max-h-32 resize-none text-sm"
              />
              <Button type="submit" size="icon" disabled={(!text.trim() && !pendingFile) || sending} title="Envoyer (Entrée)">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          )}
        </>
      )}

      <AddMembersDialog open={addOpen} onOpenChange={setAddOpen} conv={conv} />
      <ManageGroupDialog open={manageOpen} onOpenChange={setManageOpen} conv={conv} />
    </div>
  );
}

// ---- Dialogs --------------------------------------------------------

function useUsers(open: boolean) {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    chatApi.users().then((r) => setUsers(r.users)).catch(() => {}).finally(() => setLoading(false));
  }, [open]);
  return { users, loading };
}

export function NewDmDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { users, loading } = useUsers(open);
  const { user } = useAuth();
  const chat = useChat();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);
  const filtered = users.filter((u) => u.username !== user?.username && (
    u.fullName.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase())
  ));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau message</DialogTitle><DialogDescription>Choisissez un utilisateur</DialogDescription></DialogHeader>
        <Input placeholder="Rechercher un collègue..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="max-h-72 overflow-y-auto border border-border rounded-md">
          {loading ? <div className="p-6 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Chargement…</div>
            : filtered.length === 0 ? <div className="p-6 text-center text-xs text-muted-foreground">Aucun utilisateur trouvé.</div>
            : filtered.map((u) => (
            <button
              key={u.username}
              onClick={async () => {
                try {
                  const r = await chatApi.createDm(u.username);
                  await chat.refreshConversations();
                  chat.openConversation(r.id);
                  onOpenChange(false);
                } catch (e: any) { toast.error(e?.message); }
              }}
              className="w-full p-2.5 flex items-center gap-3 hover:bg-muted/60 border-b border-border/50 last:border-0 text-left"
            >
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white bg-gradient-to-br from-primary/80 to-primary">{initials(u.fullName)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{u.fullName}</div>
                <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.role}{u.team ? ` · ${u.team}` : ""}</div>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function NewGroupDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { users, loading } = useUsers(open);
  const { user } = useAuth();
  const chat = useChat();
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) { setName(""); setSelected(new Set()); setQ(""); } }, [open]);
  const filtered = users.filter((u) => u.username !== user?.username && (
    u.fullName.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase())
  ));
  const submit = async () => {
    if (!name.trim() || selected.size === 0) return;
    try {
      const r = await chatApi.createGroup(name.trim(), Array.from(selected));
      await chat.refreshConversations();
      chat.openConversation(r.id);
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message); }
  };
  const selectedUsers = users.filter((u) => selected.has(u.username));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nouveau groupe</DialogTitle><DialogDescription>Créez un groupe et ajoutez des membres</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Nom du groupe (ex. Équipe Tunis)" value={name} onChange={(e) => setName(e.target.value)} />
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2 rounded-md bg-muted/40 border border-border">
              {selectedUsers.map((u) => (
                <span key={u.username} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-background border border-border text-xs">
                  {u.fullName}
                  <button onClick={() => setSelected((p) => { const n = new Set(p); n.delete(u.username); return n; })} className="h-4 w-4 rounded-full hover:bg-muted inline-flex items-center justify-center">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input placeholder="Rechercher des membres..." value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="text-xs text-muted-foreground">{selected.size} sélectionné(s)</div>
          <div className="max-h-64 overflow-y-auto border border-border rounded-md">
            {loading ? <div className="p-6 text-center text-xs text-muted-foreground">Chargement…</div>
              : filtered.map((u) => (
              <label key={u.username} className="w-full p-2 flex items-center gap-2 hover:bg-muted/60 border-b border-border/50 last:border-0 cursor-pointer">
                <Checkbox checked={selected.has(u.username)} onCheckedChange={(v) => {
                  setSelected((prev) => { const next = new Set(prev); if (v) next.add(u.username); else next.delete(u.username); return next; });
                }} />
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials(u.fullName)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{u.fullName}</div>
                  <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.role}{u.team ? ` · ${u.team}` : ""}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={!name.trim() || selected.size === 0}>Créer le groupe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddMembersDialog({ open, onOpenChange, conv }: { open: boolean; onOpenChange: (b: boolean) => void; conv: Conversation }) {
  const { users } = useUsers(open);
  const chat = useChat();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setSelected(new Set()); }, [open]);
  const existing = new Set(conv.members.map((m) => m.username));
  const filtered = users.filter((u) => !existing.has(u.username) && (
    u.fullName.toLowerCase().includes(q.toLowerCase()) || u.username.toLowerCase().includes(q.toLowerCase())
  ));
  const submit = async () => {
    if (selected.size === 0) return;
    try {
      await chatApi.addMembers(conv.id, Array.from(selected));
      await chat.refreshConversations();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajouter des membres</DialogTitle></DialogHeader>
        <Input placeholder="Rechercher..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="text-xs text-muted-foreground">{selected.size} sélectionné(s)</div>
        <div className="max-h-64 overflow-y-auto border border-border rounded-md">
          {filtered.length === 0 ? <div className="p-6 text-center text-xs text-muted-foreground">Aucun utilisateur disponible.</div>
            : filtered.map((u) => (
            <label key={u.username} className="w-full p-2 flex items-center gap-2 hover:bg-muted/60 border-b border-border/50 last:border-0 cursor-pointer">
              <Checkbox checked={selected.has(u.username)} onCheckedChange={(v) => {
                setSelected((prev) => { const next = new Set(prev); if (v) next.add(u.username); else next.delete(u.username); return next; });
              }} />
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials(u.fullName)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{u.fullName}</div>
                <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.role}</div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={selected.size === 0}>Ajouter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BroadcastDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { users } = useUsers(open);
  const { user } = useAuth();
  const chat = useChat();
  const [target, setTarget] = useState<"all" | "role" | "team" | "users">("all");
  const [roleVal, setRoleVal] = useState("Agent");
  const [teamVal, setTeamVal] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("Annonce");
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [sending, setSending] = useState(false);
  const teams = Array.from(new Set(users.map((u) => u.team).filter(Boolean))).sort();

  useEffect(() => { if (open) { setBody(""); setSelected(new Set()); setTitle("Annonce"); setTarget("all"); setMode("individual"); } }, [open]);

  const submit = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      const value = target === "users" ? Array.from(selected) : target === "role" ? roleVal : target === "team" ? teamVal : undefined;
      await chatApi.broadcast({ body: body.trim(), title: title.trim() || "Annonce", target, value, mode });
      toast.success("Message envoyé");
      await chat.refreshConversations();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSending(false); }
  };

  if (user?.role !== "Administrateur") return null;

  const recipientsCount = target === "all" ? users.filter((u) => u.username !== user?.username).length
    : target === "role" ? users.filter((u) => u.role === roleVal && u.username !== user?.username).length
    : target === "team" ? users.filter((u) => u.team === teamVal && u.username !== user?.username).length
    : selected.size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Envoyer une annonce</DialogTitle><DialogDescription>Diffusez un message à plusieurs utilisateurs</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Destinataires</label>
            <div className="grid grid-cols-4 gap-1 mt-1">
              {(["all", "role", "team", "users"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTarget(t)}
                  className={`h-9 text-xs rounded-md border transition-colors ${target === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}>
                  {t === "all" ? "Tous" : t === "role" ? "Par rôle" : t === "team" ? "Par équipe" : "Choisir"}
                </button>
              ))}
            </div>
          </div>
          {target === "role" && (
            <select value={roleVal} onChange={(e) => setRoleVal(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
              {["Administrateur","Manager","Agent","Backoffice"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {target === "team" && (
            <select value={teamVal} onChange={(e) => setTeamVal(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm">
              <option value="">— Choisir une équipe —</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {target === "users" && (
            <div className="max-h-40 overflow-y-auto border border-border rounded-md">
              {users.filter((u) => u.username !== user?.username).map((u) => (
                <label key={u.username} className="w-full p-2 flex items-center gap-2 hover:bg-muted/60 border-b border-border/50 last:border-0 cursor-pointer">
                  <Checkbox checked={selected.has(u.username)} onCheckedChange={(v) => {
                    setSelected((prev) => { const next = new Set(prev); if (v) next.add(u.username); else next.delete(u.username); return next; });
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{u.fullName}</div>
                    <div className="text-xs text-muted-foreground truncate">@{u.username} · {u.role}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Megaphone className="h-3.5 w-3.5" />
            <span>Sera envoyé à <strong className="text-foreground">{recipientsCount}</strong> destinataire{recipientsCount > 1 ? "s" : ""}.</span>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Mode d'envoi</label>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <button type="button" onClick={() => setMode("individual")} className={`h-9 text-xs rounded-md border ${mode === "individual" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}>Messages individuels</button>
              <button type="button" onClick={() => setMode("group")} className={`h-9 text-xs rounded-md border ${mode === "group" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted/60"}`}>Un seul groupe</button>
            </div>
          </div>
          {mode === "group" && <Input placeholder="Titre de l'annonce" value={title} onChange={(e) => setTitle(e.target.value)} />}
          <Textarea placeholder="Votre message..." rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} disabled={!body.trim() || sending || (target === "users" && selected.size === 0) || (target === "team" && !teamVal)}>
            <Megaphone className="h-4 w-4 mr-2" /> Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ManageGroupDialog({ open, onOpenChange, conv }: { open: boolean; onOpenChange: (b: boolean) => void; conv: Conversation }) {
  const chat = useChat();
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(conv.name ?? "");
  const isAppAdmin = user?.role === "Administrateur";
  useEffect(() => { if (open) { setQ(""); setNewName(conv.name ?? ""); setRenaming(false); } }, [open, conv.name]);

  const refresh = async () => { await chat.refreshConversations(); };
  const setRole = async (username: string, role: "admin" | "member") => {
    setBusy(username);
    try { await chatApi.setRole(conv.id, username, role); await refresh(); toast.success(role === "admin" ? "Promu administrateur" : "Rétrogradé membre"); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  };
  const removeMember = async (username: string) => {
    if (!(await confirmDialog({ title: "Suppression", description: `Retirer ${username} du groupe ?`, tone: "destructive", confirmText: "Supprimer" }))) return;
    setBusy(username);
    try { await chatApi.removeMember(conv.id, username); await refresh(); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(null); }
  };
  const togglePolicy = async () => {
    const next = conv.postPolicy === "admins" ? "all" : "admins";
    try { await chatApi.setPostPolicy(conv.id, next); await refresh(); }
    catch (e: any) { toast.error(e?.message); }
  };
  const rename = async () => {
    if (!newName.trim() || newName.trim() === conv.name) { setRenaming(false); return; }
    try { await chatApi.rename(conv.id, newName.trim()); await refresh(); setRenaming(false); toast.success("Groupe renommé"); }
    catch (e: any) { toast.error(e?.message); }
  };

  const filteredMembers = conv.members.filter((m) =>
    !q.trim() || m.fullName.toLowerCase().includes(q.toLowerCase()) || m.username.toLowerCase().includes(q.toLowerCase())
  );
  const adminCount = conv.members.filter((m) => m.role === "admin").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gérer le groupe</DialogTitle>
          <DialogDescription>{conv.members.length} membres · {adminCount} admin{adminCount > 1 ? "s" : ""}</DialogDescription>
        </DialogHeader>

        {/* Rename */}
        {(isAppAdmin || conv.members.find((m) => m.username === user?.username)?.role === "admin") && (
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Nom du groupe</div>
            {renaming ? (
              <div className="flex gap-2">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8" autoFocus />
                <Button size="sm" onClick={rename}>OK</Button>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>Annuler</Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{conv.name ?? "(sans nom)"}</div>
                <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>Renommer</Button>
              </div>
            )}
          </div>
        )}

        <div className="rounded-md border border-border p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            {conv.postPolicy === "admins" ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            <span>{conv.postPolicy === "admins" ? "Seuls les admins peuvent poster" : "Tout le monde peut poster"}</span>
          </div>
          <Button size="sm" variant="outline" onClick={togglePolicy}>
            {conv.postPolicy === "admins" ? "Autoriser tous" : "Restreindre"}
          </Button>
        </div>

        <Input placeholder="Rechercher un membre..." value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filteredMembers.map((m) => {
            const me = m.username === user?.username;
            return (
              <div key={m.username} className="p-2 flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">{initials(m.fullName)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {m.fullName} {me && <span className="text-[10px] text-muted-foreground">(vous)</span>}
                    {m.role === "admin" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">ADMIN</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">@{m.username}{m.userRole ? ` · ${m.userRole}` : ""}</div>
                </div>
                <div className="flex items-center gap-1">
                  {m.role === "admin" ? (
                    <Button size="sm" variant="ghost" disabled={busy === m.username || (me && !isAppAdmin)} onClick={() => setRole(m.username, "member")} title="Rétrograder">
                      <ShieldOff className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy === m.username} onClick={() => setRole(m.username, "admin")} title="Promouvoir admin">
                      <Shield className="h-4 w-4" />
                    </Button>
                  )}
                  {!me && (
                    <Button size="sm" variant="ghost" disabled={busy === m.username} onClick={() => removeMember(m.username)} title="Retirer" className="text-destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
