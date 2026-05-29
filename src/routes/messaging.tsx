import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Plus, Users, Megaphone, Send, Paperclip, Loader2,
  BellOff, Bell, MoreVertical, UserPlus, LogOut, Lock, Unlock,
  Settings, Image as ImageIcon, FileText, File as FileIcon, X, MessageCircle,
  CheckCheck, Inbox, ChevronLeft,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useChat } from "@/lib/chatStore";
import { useAuth } from "@/lib/auth";
import { chatApi, type Conversation } from "@/lib/chat";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  NewDmDialog, NewGroupDialog, BroadcastDialog,
  AddMembersDialog, ManageGroupDialog,
} from "@/components/ChatWidget";
import {
  timeShort, convTitle, ConvAvatar, MessageList, ScrollToBottomButton, useChatScroll,
  MessageSearchPanel, useJumpToMessage,
} from "@/lib/chatUi";
import { confirmDialog } from "@/components/ConfirmDialogProvider";

export const Route = createFileRoute("/messaging")({
  validateSearch: (s: Record<string, unknown>) => ({
    conv: typeof s.conv === "string" ? s.conv : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Messagerie — CRM" },
      { name: "description", content: "Conversations directes, groupes et annonces — version pleine page de la messagerie." },
    ],
  }),
  component: MessagingPage,
});

type Tab = "all" | "unread" | "dm" | "groups";

function MessagingPage() {
  const { user } = useAuth();
  const chat = useChat();
  const isAdmin = user?.role === "Administrateur";
  const isManager = user?.role === "Manager";
  const { conv: convFromUrl } = Route.useSearch();

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  // Honor ?conv=<id> from sidebar deep links — switch active whenever it changes.
  useEffect(() => {
    if (convFromUrl && chat.conversations.some((c) => c.id === convFromUrl)) {
      setActiveId(convFromUrl);
    }
  }, [convFromUrl, chat.conversations]);

  useEffect(() => {
    if (!activeId && chat.conversations.length > 0) setActiveId(chat.conversations[0].id);
  }, [chat.conversations, activeId]);

  useEffect(() => {
    if (!activeId) return;
    void chat.loadMessages(activeId).then(() => chat.markRead(activeId));
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = chat.conversations;
    if (tab === "unread") list = list.filter((c) => c.unread > 0 && !c.muted);
    else if (tab === "dm") list = list.filter((c) => c.type === "dm");
    else if (tab === "groups") list = list.filter((c) => c.type === "group" || c.type === "broadcast");
    if (q) list = list.filter((c) =>
      convTitle(c, user?.username).toLowerCase().includes(q) ||
      c.members.some((m) => m.fullName.toLowerCase().includes(q) || m.username.toLowerCase().includes(q))
    );
    return list;
  }, [chat.conversations, search, tab, user?.username]);

  const counts = useMemo(() => ({
    all: chat.conversations.length,
    unread: chat.conversations.filter((c) => c.unread > 0 && !c.muted).length,
    dm: chat.conversations.filter((c) => c.type === "dm").length,
    groups: chat.conversations.filter((c) => c.type === "group" || c.type === "broadcast").length,
  }), [chat.conversations]);

  const active = chat.conversations.find((c) => c.id === activeId) ?? null;
  if (!user) return null;

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" /> Messagerie
            </h1>
            <p className="text-xs text-muted-foreground">
              {counts.all} conversation{counts.all > 1 ? "s" : ""}
              {counts.unread > 0 && <> · <span className="text-primary font-medium">{counts.unread} non lue{counts.unread > 1 ? "s" : ""}</span></>}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setNewDmOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Message
            </Button>
            {(isAdmin || isManager) && (
              <Button size="sm" variant="outline" onClick={() => setNewGroupOpen(true)}>
                <Users className="h-4 w-4 mr-1.5" /> Groupe
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => setBroadcastOpen(true)}>
                <Megaphone className="h-4 w-4 mr-1.5" /> Annonce
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-[340px_1fr] min-h-0">
          {/* Sidebar */}
          <aside className={`border-r border-border bg-card flex flex-col min-h-0 ${active ? "hidden md:flex" : "flex"}`}>
            <div className="p-2 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une conversation…"
                  className="pl-8 h-9"
                />
              </div>
              <div className="grid grid-cols-4 gap-1">
                {([
                  ["all", "Toutes"],
                  ["unread", "Non lues"],
                  ["dm", "Direct"],
                  ["groups", "Groupes"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key as Tab)}
                    className={`h-8 text-[11px] rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
                      tab === key ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    {label}
                    {counts[key] > 0 && (
                      <span className={`text-[10px] px-1 rounded-full ${tab === key ? "bg-primary-foreground/20" : "bg-muted"}`}>{counts[key]}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1">
              {filtered.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <Inbox className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                  <div className="text-sm font-medium">Aucune conversation</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {tab === "unread" ? "Tout est à jour 🎉" : "Démarrez une nouvelle discussion"}
                  </div>
                </div>
              ) : filtered.map((c) => {
                const isUnread = c.unread > 0 && !c.muted;
                const senderLabel = c.lastSender && c.lastSender !== user.username
                  ? (c.members.find((m) => m.username === c.lastSender)?.fullName?.split(" ")[0] ?? c.lastSender) + ": "
                  : c.lastSender === user.username ? "Vous: " : "";
                const typeBadge = c.type === "broadcast" ? "Annonce" : c.type === "group" ? "Groupe" : null;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveId(c.id)}
                    className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-muted/50 transition-colors border-b border-border/50 text-left ${
                      activeId === c.id ? "bg-muted/70" : ""
                    }`}
                  >
                    <ConvAvatar conv={c} meUsername={user?.username} size={42} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className={`text-sm truncate ${isUnread ? "font-semibold" : "font-medium"}`}>{convTitle(c, user?.username)}</div>
                        {typeBadge && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase tracking-wide shrink-0">{typeBadge}</span>
                        )}
                        {c.muted && <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />}
                        <div className="ml-auto text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{timeShort(c.lastMessageAt)}</div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`text-xs truncate flex-1 ${isUnread ? "text-foreground" : "text-muted-foreground"}`}>
                          {senderLabel}{c.lastBody ?? <span className="italic">Aucun message</span>}
                        </div>
                        {isUnread && (
                          <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center shrink-0">
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </ScrollArea>
          </aside>

          {/* Active conversation */}
          <section className={`min-h-0 flex flex-col ${active ? "flex" : "hidden md:flex"}`}>
            {active ? (
              <ConversationPane conv={active} onBack={() => setActiveId(null)} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MessageCircle className="h-7 w-7 text-muted-foreground" />
                </div>
                <div className="text-sm font-semibold">Sélectionnez une conversation</div>
                <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Choisissez une discussion à gauche, ou démarrez-en une nouvelle.
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      <NewDmDialog open={newDmOpen} onOpenChange={setNewDmOpen} />
      <NewGroupDialog open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      <BroadcastDialog open={broadcastOpen} onOpenChange={setBroadcastOpen} />
    </AppLayout>
  );
}

function ConversationPane({ conv, onBack }: { conv: Conversation; onBack: () => void }) {
  const { user } = useAuth();
  const chat = useChat();
  const messages = chat.messagesByConv[conv.id] ?? [];
  const hasMore = chat.hasMore[conv.id] !== false;
  const loadingOlder = !!chat.loadingOlder[conv.id];

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { scrollRef, onScroll, scrollToBottom, awayFromBottom } = useChatScroll({
    messages, convId: conv.id, loadOlder: () => chat.loadOlder(conv.id), hasMore, loadingOlder,
  });
  const { highlightedId, jump } = useJumpToMessage(scrollRef);

  const handleJump = async (msg: { id: string; createdAt: string }) => {
    const inList = messages.some((m) => m.id === msg.id);
    if (!inList) {
      try { await chat.loadAround(conv.id, msg.createdAt); } catch {}
    }
    jump(msg.id);
  };

  const onPickFile = (files: FileList | File[] | null) => {
    if (!files) return;
    const f = Array.from(files)[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast.error("Fichier trop volumineux (max 20 Mo)"); return; }
    setPendingFile(f);
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
    finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const title = convTitle(conv, user?.username);
  const meRole = conv.members.find((m) => m.username === user?.username)?.role;
  const isGroupAdmin = meRole === "admin" || user?.role === "Administrateur";
  const canPost = conv.type === "dm" || conv.postPolicy === "all" || isGroupAdmin;

  const subtitle = conv.type === "dm"
    ? "Message direct"
    : conv.type === "broadcast" ? `Annonce · ${conv.members.length} destinataires`
    : `${conv.members.length} membre(s)${conv.postPolicy === "admins" ? " · admins seulement" : ""}`;

  return (
    <>
      <div className="h-14 px-3 sm:px-4 border-b border-border bg-card flex items-center gap-2">
        <button onClick={onBack} className="md:hidden h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => conv.type !== "dm" && isGroupAdmin && setManageOpen(true)}
          className={`flex items-center gap-2 flex-1 min-w-0 text-left ${conv.type !== "dm" && isGroupAdmin ? "hover:bg-muted/40 -mx-1 px-1 rounded-md" : ""}`}
        >
          <ConvAvatar conv={conv} meUsername={user?.username} size={38} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{title}</div>
            <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
              {conv.type === "dm" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />}
              {subtitle}
            </div>
          </div>
        </button>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className={`h-8 w-8 rounded-md inline-flex items-center justify-center ${searchOpen ? "bg-muted text-primary" : "hover:bg-muted/60"}`}
          title="Rechercher dans la conversation"
        >
          <Search className="h-4 w-4" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-8 w-8 rounded-md hover:bg-muted/60 inline-flex items-center justify-center">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => chat.markRead(conv.id)}>
              <CheckCheck className="h-4 w-4 mr-2" /> Marquer comme lu
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => chat.setMute(conv.id, !conv.muted)}>
              {conv.muted ? <><Bell className="h-4 w-4 mr-2" /> Réactiver les notifications</>
                : <><BellOff className="h-4 w-4 mr-2" /> Mettre en sourdine</>}
            </DropdownMenuItem>
            {conv.type !== "dm" && isGroupAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setAddOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" /> Ajouter des membres
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setManageOpen(true)}>
                  <Settings className="h-4 w-4 mr-2" /> Gérer le groupe
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  const next = conv.postPolicy === "admins" ? "all" : "admins";
                  try { await chatApi.setPostPolicy(conv.id, next); await chat.refreshConversations(); }
                  catch (e: any) { toast.error(e?.message); }
                }}>
                  {conv.postPolicy === "admins"
                    ? <><Unlock className="h-4 w-4 mr-2" /> Autoriser tout le monde</>
                    : <><Lock className="h-4 w-4 mr-2" /> Restreindre aux admins</>}
                </DropdownMenuItem>
              </>
            )}
            {conv.type !== "dm" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={async () => {
                    if (!(await confirmDialog({ title: "Confirmer l'action", description: "Quitter cette conversation ?", tone: "warning", confirmText: "Continuer" }))) return;
                    try { await chatApi.leave(conv.id); onBack(); await chat.refreshConversations(); }
                    catch (e: any) { toast.error(e?.message); }
                  }}
                >
                  <LogOut className="h-4 w-4 mr-2" /> Quitter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
        className={`relative flex-1 overflow-y-auto px-3 sm:px-6 py-3 bg-background ${dragOver ? "ring-2 ring-inset ring-primary/40" : ""}`}
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
          <div className="text-center py-16">
            <div className="text-4xl mb-2">👋</div>
            <div className="text-sm font-medium">Aucun message pour le moment</div>
            <div className="text-xs text-muted-foreground">Soyez le premier à écrire !</div>
          </div>
        )}
        <MessageList conv={conv} messages={messages} meUsername={user?.username} highlightedId={highlightedId} />
        <ScrollToBottomButton show={awayFromBottom} onClick={scrollToBottom} unread={conv.unread} />
      </div>

      {pendingFile && (
        <div className="px-3 py-2 flex items-center gap-2 border-t border-border bg-muted/30">
          <div className="h-9 w-9 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
            {pendingFile.type.startsWith("image/") ? <ImageIcon className="h-4 w-4" />
              : pendingFile.type === "application/pdf" ? <FileText className="h-4 w-4" />
              : <FileIcon className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{pendingFile.name}</div>
            <div className="text-[10px] text-muted-foreground">{(pendingFile.size / 1024).toFixed(1)} Ko</div>
          </div>
          <button type="button" onClick={() => setPendingFile(null)} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-background">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {!canPost ? (
        <div className="p-3 border-t border-border bg-muted/30 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
          <Lock className="h-3.5 w-3.5" /> Seuls les administrateurs peuvent poster dans ce groupe.
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
          className="p-2 sm:p-3 border-t border-border bg-card flex items-end gap-1.5"
        >
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
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder={pendingFile ? "Ajouter une légende…" : "Écrire un message…"}
            rows={1}
            className="min-h-9 max-h-40 resize-none text-sm"
          />
          <Button type="submit" size="icon" disabled={(!text.trim() && !pendingFile) || sending} title="Envoyer (Entrée)">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}

      <AddMembersDialog open={addOpen} onOpenChange={setAddOpen} conv={conv} />
      <ManageGroupDialog open={manageOpen} onOpenChange={setManageOpen} conv={conv} />
    </>
  );
}
