const { Module } = require('../WA_index');
Module({ pattern: 'ping', fromMe: true, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    // Handle start command logic here
    let start = new Date().getTime()
    await m.client.sendMessage(m.jid, {
      text: `❮ ᴛᴇsᴛɪɴɢ ᴘɪɴɢ ❯`,
    });
    let end = new Date().getTime()
    await m.client.sendMessage(m.jid, {
      text: `ʟᴀᴛᴇɴᴄʏ: ${end-start} ᴍs`,
    });
})
Module(
  {
    pattern: "reboot ?(.*)",
    fromMe: true,
    desc: "restarts the bot",
    use: "utility",
  },
  async (m, match) => {
    // Handle start command logic here
    process.exit(0);
  }
);
Module(
  { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
  async (m, match) => {
    let text = m.text;
    if (text&&text.startsWith(">")) {
      const util = require("util");
      try {
        let return_val = await eval(
          `(async () => { ${text.replace(">", "")} })()`
        );
        if (return_val && typeof return_val !== "string")
          return_val = util.inspect(return_val);
        if (return_val) {
        await m.client.sendMessage(m.jid, {
          text: return_val || "no return value",
        });};
      } catch (e) {
        if (e) {
          await m.client.sendMessage(m.jid, {
            text: util.format(e),
          });}
      }
    }
  }
);