import { useState, useEffect } from "react";

export function useHashnodeIntegration() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/integrations/hashnode")
      .then((res) => res.json())
      .then((data) => {
        setConnected(data.connected ?? false);
        setUsername(data.username ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const openConnect = () => {
    setError("");
    setToken("");
    setConnectOpen(true);
  };

  const connect = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setConnecting(true);
    setError("");
    try {
      const res = await fetch("/api/integrations/hashnode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to connect");
        return;
      }
      setConnected(true);
      setUsername(data.username ?? null);
      setConnectOpen(false);
      setToken("");
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/hashnode", { method: "DELETE", headers: { "X-CSRF-Protection": "1" } });
      if (!res.ok) throw new Error(`Hashnode disconnect failed: ${res.status}`);
      setConnected(false);
      setUsername(null);
      setDisconnectOpen(false);
    } catch (err) {
      console.error("Failed to disconnect Hashnode", err);
    } finally {
      setDisconnecting(false);
    }
  };

  return {
    loading,
    connected,
    username,
    connectOpen,
    setConnectOpen,
    disconnectOpen,
    setDisconnectOpen,
    token,
    setToken,
    connecting,
    disconnecting,
    error,
    setError,
    openConnect,
    connect,
    disconnect,
  };
}

export type HashnodeIntegration = ReturnType<typeof useHashnodeIntegration>;
