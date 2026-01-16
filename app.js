import { App } from "@slack/bolt";
import "dotenv/config";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

app.event("app_mention", async ({ event, say }) => {
  await say({
    text: "I'm alive 🧠",
    thread_ts: event.ts,
  });
});

app.message(async ({ message, say }) => {
  if (message.subtype) return;
  await say("DM received 👀");
});

(async () => {
  await app.start();
  console.log("⚡ Slack bot running");
})();
