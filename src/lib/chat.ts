// Chat API client — wraps backend/php/chat.php
import { api, apiUpload } from "./api";

export type ChatType = "dm" | "group" | "broadcast";

export type ChatMember = {
  username: string;
  fullName: string;
  userRole: string | null;
  team: string | null;
  role: "admin" | "member";
  muted: boolean;
  lastReadAt: string | null;
};

export type Conversation = {
  id: string;
  type: ChatType;
  name: string | null;
  createdBy: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastBody: string | null;
  lastSender: string | null;
  muted: boolean;
  lastReadAt: string | null;
  unread: number;
  postPolicy: "all" | "admins";
  members: ChatMember[];
};

export type ChatAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
};

export type SeenEntry = {
  username: string;
  fullName: string;
  readAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  sender: string | null;
  senderName: string;
  body: string;
  isSystem: boolean;
  createdAt: string;
  attachment: ChatAttachment | null;
  seenBy?: SeenEntry[];
};

export type ChatUser = {
  username: string;
  fullName: string;
  role: string;
  team: string;
};

const PATH = "/chat.php";

export const chatApi = {
  conversations: () =>
    api<{ conversations: Conversation[] }>(PATH, { query: { action: "conversations" } }),
  messages: (conversationId: string, before?: string, limit = 50) =>
    api<{ messages: ChatMessage[] }>(PATH, {
      query: { action: "messages", conversation_id: conversationId, before, limit },
    }),
  poll: () =>
    api<{ serverTime: string; totalUnread: number; conversations: { id: string; lastMessageAt: string | null; unread: number }[] }>(
      PATH, { query: { action: "poll" } },
    ),
  search: (conversationId: string, q: string, limit = 30) =>
    api<{ results: ChatMessage[] }>(PATH, {
      query: { action: "search", conversation_id: conversationId, q, limit },
    }),
  users: () => api<{ users: ChatUser[] }>(PATH, { query: { action: "users" } }),
  send: (conversationId: string, body: string) =>
    api<{ message: ChatMessage }>(PATH, { method: "POST", body: { action: "send", conversation_id: conversationId, body } }),
  upload: (conversationId: string, file: File, caption = "") =>
    apiUpload<{ message: ChatMessage }>(PATH, {
      action: "upload",
      conversation_id: conversationId,
      body: caption,
      file,
    }),
  createDm: (username: string) =>
    api<{ id: string; created: boolean }>(PATH, { method: "POST", body: { action: "create_dm", user: username } }),
  createGroup: (name: string, members: string[]) =>
    api<{ id: string }>(PATH, { method: "POST", body: { action: "create_group", name, members } }),
  addMembers: (conversationId: string, members: string[]) =>
    api<{ added: number }>(PATH, { method: "POST", body: { action: "add_members", conversation_id: conversationId, members } }),
  removeMember: (conversationId: string, user: string) =>
    api(PATH, { method: "POST", body: { action: "remove_member", conversation_id: conversationId, user } }),
  rename: (conversationId: string, name: string) =>
    api(PATH, { method: "POST", body: { action: "rename", conversation_id: conversationId, name } }),
  setRole: (conversationId: string, user: string, role: "admin" | "member") =>
    api(PATH, { method: "POST", body: { action: "set_role", conversation_id: conversationId, user, role } }),
  setPostPolicy: (conversationId: string, policy: "all" | "admins") =>
    api(PATH, { method: "POST", body: { action: "set_post_policy", conversation_id: conversationId, policy } }),
  markRead: (conversationId: string) =>
    api(PATH, { method: "POST", body: { action: "mark_read", conversation_id: conversationId } }),
  setMute: (conversationId: string, muted: boolean) =>
    api(PATH, { method: "POST", body: { action: "set_mute", conversation_id: conversationId, muted } }),
  leave: (conversationId: string) =>
    api(PATH, { method: "POST", body: { action: "leave", conversation_id: conversationId } }),
  broadcast: (input: {
    body: string;
    title?: string;
    target: "all" | "role" | "team" | "users";
    value?: string | string[];
    mode?: "individual" | "group";
  }) => api(PATH, { method: "POST", body: { action: "broadcast", ...input } }),
};
