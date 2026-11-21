import { useState, useEffect } from "react";

export function useGoogleDocsIntegration() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/google-docs")
      .then((res) => res.json())
      .then((data) => setConnected(data.connected ?? false))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/integrations/google-docs", { method: "DELETE", headers: { "X-CSRF-Protection": "1" } });
      if (!res.ok) throw new Error(`Google Docs disconnect failed: ${res.status}`);
      setConnected(false);
    } catch (err) {
      console.error("Failed to disconnect Google Docs", err);
    } finally {
      setDisconnecting(false);
    }
  };

  return { loading, connected, disconnecting, disconnect };
}

export type GoogleDocsIntegration = ReturnType<typeof useGoogleDocsIntegration>;
