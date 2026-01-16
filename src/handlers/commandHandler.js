/**
 * Slack slash command handlers
 */

/**
 * Handle /ejento-help command
 * @param {object} params - Command parameters from Slack Bolt
 */
async function handleHelpCommand({ command, ack, respond }) {
  await ack();

  const helpText = `
*🤖 Ejento AI Assistant - Help*

I'm your AI assistant powered by Ejento. Here's how you can interact with me:

*Direct Messages:*
• Simply send me a message in our DM conversation
• I'll respond with relevant information from your knowledge base

*In Channels:*
• Mention me using @Ejento followed by your question
• Example: \`@Ejento What is our vacation policy?\`

*Available Commands:*
• \`/ejento-help\` - Show this help message

*Tips:*
• Be specific with your questions for better results
• I can provide sources/references for my answers
• Follow-up questions help me understand context better

Need more help? Contact your administrator.
  `.trim();

  await respond({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: helpText,
        },
      },
    ],
    text: 'Ejento Help',
    response_type: 'ephemeral', // Only visible to the user who triggered the command
  });
}

export { handleHelpCommand };

