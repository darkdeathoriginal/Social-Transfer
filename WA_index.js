const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  generateLinkPreviewIfRequired,
  WAProto,
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const pino = require("pino");
const modules = {};
const onMessages = [];
const onReadys = [];
const config = require("./config");
const { Message, Image, Video, Audio } = require("./WA_lib/index");
const { welcomeDb } = require("./WA_plugins/sql/welcome");
const JIDS = config.SUDO;
const handlers = config.HANDLERS;

function Module(obj, callback) {
  obj.callback = callback;
  modules[obj.pattern] = obj;
}
function onMessage(obj, callback) {
  obj.callback = callback;
  onMessages.push(obj);
}
function onReady(obj, callback) {
  obj.callback = callback;
  onReadys.push(obj);
}

const store = makeInMemoryStore({
  logger: pino().child({
    level: "silent",
    stream: "store",
  }),
});
const assertColor = async (color) => {
  let assertedColor;
  if (typeof color === "number") {
    assertedColor = color > 0 ? color : 0xffffffff + Number(color) + 1;
  } else {
    let hex = color.trim().replace("#", "");
    if (hex.length <= 6) {
      hex = "FF" + hex.padStart(6, "0");
    }

    assertedColor = parseInt(hex, 16);
    return assertedColor;
  }
};

store.readFromFile("./session/neoxr_store.json");
setInterval(() => {
  store.writeToFile("./session/neoxr_store.json");
}, 10000);

const connect = async () => {
  await config.DATABASE.sync();
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const client = makeWASocket({
    logger: pino({
      level: "silent",
    }),
    printQRInTerminal: true,
    patchMessageBeforeSending: async (message) => {
      const requiresPatch = !!(
        message.buttonsMessage ||
        message.templateMessage ||
        message.listMessage
      );
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadataVersion: 2,
                deviceListMetadata: {},
              },
              ...message,
            },
          },
        };
      }
      if ("edit" in message) {
        let m = {};
        if ("text" in message) {
          const extContent = { text: message.text };

          let urlInfo = message.linkPreview;
          if (typeof urlInfo === "undefined") {
            urlInfo = await generateLinkPreviewIfRequired(
              message.text,
              options.getUrlInfo,
              options.logger
            );
          }

          if (urlInfo) {
            extContent.canonicalUrl = urlInfo["canonical-url"];
            extContent.matchedText = urlInfo["matched-text"];
            extContent.jpegThumbnail = urlInfo.jpegThumbnail;
            extContent.description = urlInfo.description;
            extContent.title = urlInfo.title;
            extContent.previewType = 0;

            const img = urlInfo.highQualityThumbnail;
            if (img) {
              extContent.thumbnailDirectPath = img.directPath;
              extContent.mediaKey = img.mediaKey;
              extContent.mediaKeyTimestamp = img.mediaKeyTimestamp;
              extContent.thumbnailWidth = img.width;
              extContent.thumbnailHeight = img.height;
              extContent.thumbnailSha256 = img.fileSha256;
              extContent.thumbnailEncSha256 = img.fileEncSha256;
            }
          }

          if (options.backgroundColor) {
            extContent.backgroundArgb = await assertColor(
              options.backgroundColor
            );
          }

          if (options.font) {
            extContent.font = options.font;
          }

          m.extendedTextMessage = extContent;
        }
        m = {
          protocolMessage: {
            key: message.edit,
            editedMessage: m,
            timestampMs: Date.now(),
            type: WAProto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
          },
        };
        WAProto.Message.fromObject(m);
        return {};
      }
      return message;
    },
    browser: ["@dark / dark-bot", "safari", "1.0.0"],
    auth: state,
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg.message || undefined;
      }
      return {
        conversation: "hello",
      };
    },
    // To see the latest version : https://web.whatsapp.com/check-update?version=1&platform=web
    version: [2, 2308, 7],
  });
  store.bind(client.ev);
  client.store = store;
  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (lastDisconnect == "undefined" && qr != "undefined") {
      qrcode.generate(qr, {
        small: true,
      });
    }
    if (connection === "connecting") {
      console.log("connecting");
    } else if (connection === "open") {
      module.exports = {
        Module,
        onMessage,
        onReady,
        modules,
        client,
      };
      const pluginFolder = "./WA_plugins/";
      const files = fs.readdirSync(pluginFolder);

      files.forEach((file) => {
        if (file.endsWith(".js")) {
          const filePath = pluginFolder + file;
          require(filePath);
        }
      });

      client.sendMessage("919072215994@s.whatsapp.net", {
        text: "bot started",
      });
      console.log(
        `Connected, you login as ${
          client.user.name || client.user.verifiedName
        }`
      );

      require("./TG_index");
      require("./server/server");
      for (let i of onReadys) {
        i.callback(client);
      }
    } else if (connection === "close") {
      if (
        lastDisconnect.error.output.statusCode == DisconnectReason.loggedOut
      ) {
        console.log(`Can't connect to Web Socket`);
        //   await props.save()
        process.exit(0);
      } else {
        process.exit(0);
      }
    }
  });
  client.ev.on("creds.update", saveCreds);
  client.ev.on("group-participants.update", async (groupUpdate) => {
    await welcomeDb.sync();
    const data = await welcomeDb.findAll();
    const jid = groupUpdate.id;
    let tt = data.find((c) => c.name === jid);
    try {
      if (tt && groupUpdate.action == "add") {
        let text = tt.data;
        const { subject, desc } = await client.groupMetadata(groupUpdate.id);
        const participant = groupUpdate.participants[0];
        const picture = await client
          .profilePictureUrl(participant, "image")
          .catch((e) => console.log(e));
        text = text
          .replace("{user}", `@${participant.split("@")[0]}`)
          .replace("{subject}", `${subject}`)
          .replace("{desc}", `${desc}`)
          .replaceAll("\\n", `\n`);
        if (text.match("{pp}") && picture) {
          text = text.replace("{pp}", ``);
          await client.sendMessage(groupUpdate.id, {
            image: { url: picture },
            caption: text,
            mentions: [participant],
          });
        } else {
          await client.sendMessage(groupUpdate.id, {
            text: text,
            mentions: [participant],
          });
        }
      }
    } catch (e) {
      console.log(e);
    }
  });
  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      m = chatUpdate.messages[0];

      if (!m.message || m.key.id.startsWith("BAE")) return;
      client.readMessages([m.key]);
      if (m.message.imageMessage) {
        m = new Image(client, m);
      } else if (m.message.videoMessage) {
        m = new Video(client, m);
      } else if (m.message.audioMessage) {
        m = new Audio(client, m);
      } else {
        m = new Message(client, m);
      }
      const regexPattern = `^[${handlers
        .map((handler) => `\\${handler}`)
        .join("")}]([a-zA-Z]+)(?:\\s+(.+))?`;
      const text = m.message || "";
      let jid = m.data?.key?.participant ? m.data.key.participant : m.jid;
      if (typeof text === "string") {
        const regex = new RegExp(regexPattern);
        const match = text.match(regex);
        if (match) {
          match.shift();
          let command = modules[match[0]];

          if (command && (!command.fromMe || JIDS.includes(jid))) {
            command.callback(m, match);
          }
        }
      }
      for (let i of onMessages) {
        if (!i.fromMe || JIDS.includes(jid)) {
          i.callback(m);
        }
      }
    } catch (e) {
      console.log(e);
    }
  });
};

connect().catch((e) => process.exit(0));
