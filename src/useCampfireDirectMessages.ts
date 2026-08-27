import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

export type DirectMessage = {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type RawDirectMessage = {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

type Result = { ok: boolean; message: string };

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Falha na mensagem privada.");
  }
  return "Não foi possível concluir a mensagem privada.";
}

export function useCampfireDirectMessages(
  currentUserId: string,
  targetUserId: string | null,
  active: boolean,
) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const loadMessages = useCallback(async (resolvedThreadId: string) => {
    const { data, error: loadError } = await supabase.from("direct_messages")
      .select("id,thread_id,sender_id,body,created_at")
      .eq("thread_id", resolvedThreadId)
      .order("created_at", { ascending: true })
      .limit(250);
    if (loadError) throw loadError;
    setMessages(((data ?? []) as RawDirectMessage[]).map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      body: row.body,
      createdAt: row.created_at,
    })));
  }, []);

  const ensureThread = useCallback(async () => {
    if (!active || !targetUserId || targetUserId === currentUserId) return null;
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("get_or_create_direct_thread", {
        p_target_user_id: targetUserId,
      });
      if (rpcError) throw rpcError;
      if (typeof data !== "string") throw new Error("O banco não retornou a conversa privada.");
      setThreadId(data);
      await loadMessages(data);
      return data;
    } catch (loadError) {
      setError(errorText(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [active, currentUserId, loadMessages, targetUserId]);

  useEffect(() => {
    setThreadId(null);
    setMessages([]);
    if (active && targetUserId) void ensureThread();
  }, [active, targetUserId, ensureThread]);

  useEffect(() => {
    if (!active || !threadId) return;
    const channel = supabase.channel(`direct-thread:${threadId}:${Date.now()}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "direct_messages",
        filter: `thread_id=eq.${threadId}`,
      }, () => void loadMessages(threadId))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [active, loadMessages, threadId]);

  const send = useCallback(async (body: string): Promise<Result> => {
    const clean = body.trim();
    if (!clean) return { ok: false, message: "Escreva uma mensagem." };
    let resolvedThreadId = threadId;
    if (!resolvedThreadId) resolvedThreadId = await ensureThread();
    if (!resolvedThreadId) return { ok: false, message: error || "Não foi possível abrir a conversa." };
    setSending(true);
    try {
      const { error: rpcError } = await supabase.rpc("send_direct_message", {
        p_thread_id: resolvedThreadId,
        p_body: clean,
      });
      if (rpcError) throw rpcError;
      await loadMessages(resolvedThreadId);
      return { ok: true, message: "Mensagem enviada." };
    } catch (sendError) {
      const message = errorText(sendError);
      setError(message);
      return { ok: false, message };
    } finally {
      setSending(false);
    }
  }, [ensureThread, error, loadMessages, threadId]);

  return { threadId, messages, loading, sending, error, send, refresh: ensureThread };
}
