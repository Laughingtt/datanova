/**
 * End-to-end test: WebSocket chat → pi AgentHarness → LLM response
 *
 * Usage: node scripts/test-ws-chat.mjs
 */
import WebSocket from "ws";

const WS_URL = process.env.WS_URL || "ws://localhost:3000/ws/chat";
const CONVERSATION_ID = `test-conv-${Date.now()}`;

console.log(`Connecting to ${WS_URL}...`);

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ Connected");

  // Step 1: Initialize session
  const initMsg = {
    type: "init",
    payload: {
      conversationId: CONVERSATION_ID,
      modelProvider: "deepseek",
      modelId: "deepseek-v4-flash",
    },
  };
  console.log(`📤 Sending init: ${JSON.stringify(initMsg)}`);
  ws.send(JSON.stringify(initMsg));

  // Step 2: Send message after init_success
  let initDone = false;
  ws.on("message", (raw) => {
    const event = JSON.parse(raw.toString());

    // Log every event
    const type = event.type;
    const summary = type === "text_delta"
      ? `text_delta: "${(event.delta || "").slice(0, 40)}"`
      : type === "thinking"
      ? `thinking: "${(event.content || "").slice(0, 60)}"`
      : type === "tool_execution_start"
      ? `tool_call: ${event.toolName}`
      : type === "tool_execution_end"
      ? `tool_result: ${event.toolName} (error=${event.isError})`
      : type === "error"
      ? `❌ error: ${event.error}`
      : JSON.stringify(event).slice(0, 100);

    console.log(`📥 ${summary}`);

    if (type === "init_success" && !initDone) {
      initDone = true;
      // Send a test message
      const msg = {
        type: "message",
        text: "你好，请介绍一下你自己",
        payload: { conversationId: CONVERSATION_ID },
      };
      console.log(`📤 Sending message: "${msg.text}"`);
      ws.send(JSON.stringify(msg));
    }

    if (type === "agent_end" || type === "settled" || type === "response_complete") {
      // Keep listening for a bit to catch any late events
      setTimeout(() => {
        console.log("\n✅ Chat test complete — received response from agent");
        ws.close();
        process.exit(0);
      }, 2000);
    }

    if (type === "error") {
      console.log("\n❌ Chat test failed with error");
      ws.close();
      process.exit(1);
    }
  });
});

ws.on("error", (err) => {
  console.error("❌ WebSocket error:", err.message);
  process.exit(1);
});

ws.on("close", () => {
  console.log("Connection closed");
});

// Timeout after 60s
setTimeout(() => {
  console.log("⏰ Timeout — no response after 60s");
  process.exit(1);
}, 60000);
