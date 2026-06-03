/**
 * End-to-end test: WebSocket chat through Vite proxy
 */
import WebSocket from "ws";

const WS_URL = process.env.WS_URL || "ws://localhost:5173/ws/chat";
const CONVERSATION_ID = `test-conv-${Date.now()}`;

console.log(`Connecting to ${WS_URL}...`);

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ Connected");

  const initMsg = {
    type: "init",
    payload: {
      conversationId: CONVERSATION_ID,
      modelProvider: "deepseek",
      modelId: "deepseek-v4-flash",
    },
  };
  console.log(`📤 Init`);
  ws.send(JSON.stringify(initMsg));

  let initDone = false;
  let textChunks = 0;

  ws.on("message", (raw) => {
    const event = JSON.parse(raw.toString());
    const type = event.type;

    if (type === "init_success" && !initDone) {
      initDone = true;
      const msg = { type: "message", text: "你好", payload: { conversationId: CONVERSATION_ID } };
      console.log(`📤 Send: "你好"`);
      ws.send(JSON.stringify(msg));
    }

    if (type === "text_delta") {
      textChunks++;
    }

    if (type === "response_complete") {
      console.log(`✅ Got ${textChunks} text_delta chunks + response_complete`);
      console.log(`   Content preview: ${(event.content || "").slice(0, 80)}...`);
      ws.close();
      process.exit(0);
    }

    if (type === "error") {
      console.log(`❌ Error: ${event.error}`);
      ws.close();
      process.exit(1);
    }
  });
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err.message);
  process.exit(1);
});

setTimeout(() => { console.log("⏰ Timeout"); process.exit(1); }, 60000);
