import { useState } from "react";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setEvents([]);
    setResult("");

    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Request failed");
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);

        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;

          const parsed = JSON.parse(line.slice(6));

          if (parsed.type === "tool_call") {
            setEvents((prev) => [...prev, `🔧 ${parsed.name}`]);
          }

          if (parsed.type === "result") {
            setResult(parsed.text);
          }

          if (parsed.type === "error") {
            throw new Error(parsed.message);
          }
        }
      }
      // setResult(data.result);
    } catch (error) {
      setResult(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "20px",
        fontFamily: "system-ui",
      }}
    >
      <h1> Jira Agent</h1>
      <p>
        Ask me to plan your work. I will search your Jira and create a roadmap.
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: "20px" }}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="E.g. 'I need to upgrade my portfolio to React 19. What work should I prioritize?'"
          rows={4}
          style={{
            width: "100%",
            minHeight: "100px",
            padding: "10px",
            fontFamily: "monospace",
            fontSize: "14px",
            marginBottom: "10px",
          }}
        />
        <button
          type="submit"
          disabled={loading || !prompt.trim()}
          style={{
            marginTop: "10px",
            padding: "10px 20px",
            fontSize: "16px",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Planning..." : "Get Plan"}
        </button>
      </form>

      {events.length > 0 && (
        <div style={{ marginBottom: "20px" }}>
          <h3>Events:</h3>
          <ul>
            {events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#f5f5f5",
            borderRadius: "4px",
            whiteSpace: "pre-wrap",
            fontFamily: "monospace",
            fontSize: "14px",
          }}
        >
          {result}
        </div>
      )}
    </div>
  );
}
