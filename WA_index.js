const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeInMemoryStore,
  // generateLinkPreviewIfRequired, // Not used in this minimal example focus
  WAProto,
  fetchLatestBaileysVersion,
  initAuthCreds, // Import initAuthCreds for default structure
} = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const zlib = require('zlib');

// --- Config (Keep yours) ---
// const qrcode = require('qrcode-terminal');
const modules = {};
const onMessages = [];
const onReadys = [];
const config = require("./config"); // Your config.js
const { Message, Image, Video, Audio } = require("./WA_lib/index"); // Your WA_lib
const { welcomeDb } = require("./WA_plugins/sql/welcome"); // Your welcomeDB
const JIDS = config.SUDO;
const handlers = config.HANDLERS;


// --- Baileys Session Configuration ---
const SESSION_FOLDER_PATH = "session";
// Updated Env Var Name to reflect selective + compressed
const WA_CREDS_ENV_VAR_NAME = "WA_SESSION_SELECTIVE_COMPRESSED_BASE64";
const CREDS_FILENAME = "creds.json";
const CHAT_STORE_FILENAME = "sot_store.json";

// --- Selective Creds Configuration ---
const ESSENTIAL_CREDS_KEYS = [
    'noiseKey', 'signedIdentityKey', 'signedPreKey', 'registrationId', 'advSecretKey',
    'nextPreKeyId', 'firstUnuploadedPreKeyId', 'deviceId', 'phoneId', 'identityId',
    'registered', 'registration', 'account', 'me', 'signalIdentities', 'myAppStateKeyId',
    'platform', // Might be important
    // 'accountSyncCounter', // Often can be defaulted
];

// Helper to recursively convert Buffer instances to Baileys' file format for JSON
function convertBuffersToStaticFormat(obj) {
    if (Buffer.isBuffer(obj)) {
        return { type: 'Buffer', data: obj.toString('base64') };
    } else if (Array.isArray(obj)) {
        return obj.map(convertBuffersToStaticFormat);
    } else if (typeof obj === 'object' && obj !== null) {
        const res = {};
        for (const key in obj) {
            res[key] = convertBuffersToStaticFormat(obj[key]);
        }
        return res;
    }
    return obj;
}

// Helper to recursively convert Baileys' file format for Buffers back to Buffer instances
function convertStaticFormatToBuffers(obj) {
    if (typeof obj === 'object' && obj !== null) {
        if (obj.type === 'Buffer' && typeof obj.data === 'string') {
            try {
                return Buffer.from(obj.data, 'base64');
            } catch (e) {
                console.error("Error converting static buffer data to Buffer:", e, "Data:", obj.data);
                return obj; // Return original if conversion fails
            }
        } else if (Array.isArray(obj)) {
            return obj.map(convertStaticFormatToBuffers);
        }
        const res = {};
        for (const key in obj) {
            res[key] = convertStaticFormatToBuffers(obj[key]);
        }
        return res;
    }
    return obj;
}


/**
 * Loads selected creds from a compressed Base64 string, reconstructs full creds,
 * and writes it to the session folder.
 * @param {string} selectiveCompressedBase64String
 * @param {string} sessionFolderPath
 * @returns {Promise<boolean>}
 */
const loadSelectiveCredsFromString = async (selectiveCompressedBase64String, sessionFolderPath) => {
  if (!selectiveCompressedBase64String) {
    console.log("No selective compressed Base64 session creds string provided.");
    return false;
  }
  try {
    const compressedBuffer = Buffer.from(selectiveCompressedBase64String, 'base64');
    const selectiveJsonString = zlib.inflateSync(compressedBuffer).toString('utf8');
    const selectiveDataStatic = JSON.parse(selectiveJsonString);
    const loadedSelectiveCredsWithBuffers = convertStaticFormatToBuffers(selectiveDataStatic);

    // Reconstruct a full creds structure
    const fullCreds = initAuthCreds(); // Get Baileys default structure
    for (const key of ESSENTIAL_CREDS_KEYS) {
        if (loadedSelectiveCredsWithBuffers.hasOwnProperty(key)) {
            fullCreds[key] = loadedSelectiveCredsWithBuffers[key];
        }
    }
    // Add any other fields that might have been in the original full creds and are not in ESSENTIAL_CREDS_KEYS but are part of initAuthCreds
    // This loop ensures that if ESSENTIAL_CREDS_KEYS contains a field, it uses the loaded value,
    // otherwise it uses the default from initAuthCreds or what was already there.
    for(const key in fullCreds){
        if(loadedSelectiveCredsWithBuffers.hasOwnProperty(key)){
            fullCreds[key] = loadedSelectiveCredsWithBuffers[key];
        }
    }


    if (!fs.existsSync(sessionFolderPath)) {
      fs.mkdirSync(sessionFolderPath, { recursive: true });
    }

    const credsFilePath = path.join(sessionFolderPath, CREDS_FILENAME);
    // Convert Buffers back to static format for writing to file, as Baileys' file reader expects this.
    const fileContent = JSON.stringify(convertBuffersToStaticFormat(fullCreds), null, 2);
    fs.writeFileSync(credsFilePath, fileContent, { encoding: "utf8" });
    
    console.log(`${CREDS_FILENAME} loaded from selective compressed Base64 string and written to:`, credsFilePath);
    return true;
  } catch (e) {
    console.error(`Failed to load ${CREDS_FILENAME} from selective compressed Base64 string:`, e);
    return false;
  }
};

/**
 * Takes the current full creds (with Buffer instances), selects essential fields,
 * converts Buffers to static format, compresses, and returns as Base64 string.
 * @param {object} currentCreds The current credentials object from Baileys state (with actual Buffers).
 * @returns {Promise<string|null>}
 */
const saveSelectiveCredsToString = async (currentCreds) => {
  try {
    if (!currentCreds) {
        console.warn("Current creds object is null/undefined, cannot save selectively.");
        return null;
    }
    const selectiveDataWithBuffers = {};
    for (const key of ESSENTIAL_CREDS_KEYS) {
        if (currentCreds.hasOwnProperty(key)) {
            selectiveDataWithBuffers[key] = currentCreds[key];
        }
    }

    if (Object.keys(selectiveDataWithBuffers).length === 0) {
        console.warn("No essential keys found in current creds to save selectively.");
        return null;
    }

    const selectiveDataStatic = convertBuffersToStaticFormat(selectiveDataWithBuffers);
    const selectiveJsonString = JSON.stringify(selectiveDataStatic); // Compact stringify
    const compressedBuffer = zlib.deflateSync(selectiveJsonString);
    const base64String = compressedBuffer.toString('base64');
    return base64String;
  } catch (e) {
    console.error(`Failed to process and save selective creds to string:`, e);
    return null;
  }
};

// --- Module and Event Handler Setup (Your existing code) ---
function Module(obj, callback) { obj.callback = callback; modules[obj.pattern] = obj; }
function onMessage(obj, callback) { obj.callback = callback; onMessages.push(obj); }
function onReady(obj, callback) { obj.callback = callback; onReadys.push(obj); }


// --- Chat Store Setup ---
if (!fs.existsSync(SESSION_FOLDER_PATH)) {
  fs.mkdirSync(SESSION_FOLDER_PATH, { recursive: true });
}
const store = makeInMemoryStore({
  logger: pino().child({ level: "silent", stream: "store" }),
});
const chatStoreFilePath = path.join(SESSION_FOLDER_PATH, CHAT_STORE_FILENAME);
if (fs.existsSync(chatStoreFilePath)) { /* ... load store ... */ }
setInterval(() => { /* ... save store ... */ }, 10000);


const patchMessageBeforeSending = async (message, getUrlInfoPlaceholder) => {
  // ... (your existing patchMessageBeforeSending logic)
  return message;
};


const connect = async () => {
  await config.DATABASE.sync();

  const waCredsEnv = process.env[WA_CREDS_ENV_VAR_NAME];
  let credsLoadedFromEnv = false;
  if (waCredsEnv) {
    console.log(`Found ${WA_CREDS_ENV_VAR_NAME}, attempting to load selective creds from it.`);
    credsLoadedFromEnv = await loadSelectiveCredsFromString(waCredsEnv, SESSION_FOLDER_PATH);
  } else {
    console.log(`${WA_CREDS_ENV_VAR_NAME} not found. Will check for local ${CREDS_FILENAME}.`);
  }

  // ... (logging for load success/failure) ...
  
  const { state, saveCreds: originalSaveCreds } = await useMultiFileAuthState(SESSION_FOLDER_PATH);

  const saveCreds = async () => {
    await originalSaveCreds(); // This updates state.creds and writes the full creds.json to disk
    // Now use the updated state.creds (which has actual Buffers) for selective saving
    const newSelectiveCompressedBase64 = await saveSelectiveCredsToString(state.creds);
    if (newSelectiveCompressedBase64) {
      console.log("\n------------------------------------------------------------------");
      console.log(`[SELECTIVE CREDS UPDATED & COMPRESSED] To persist, copy Base64 string below and set as ${WA_CREDS_ENV_VAR_NAME}:`);
      console.log(newSelectiveCompressedBase64);
      console.log("------------------------------------------------------------------\n");
    }
  };

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using Baileys version: ${version.join(".")}, isLatest: ${isLatest}`);

  const client = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    auth: state, // state.creds is populated by useMultiFileAuthState from the file
    // ... (rest of your makeWASocket options) ...
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return WAProto.Message.fromObject({});
    },
  });

  store.bind(client.ev);
  client.store = store;

  client.ev.on("creds.update", saveCreds); // Use our wrapped saveCreds

  client.ev.on("connection.update", async (update) => {
    // ... (Your existing connection.update logic - QR, connecting, open, close)
    // Ensure the 'close' logic correctly handles loggedOut/badSession by clearing session files.
     const { connection, lastDisconnect, qr } = update;

    if (qr) { console.log("QR code received, please scan!"); }
    if (connection === "connecting") { console.log("Connecting to WhatsApp..."); }
    else if (connection === "open") {
      console.log("WhatsApp connection opened!");
      console.log(`Connected as: ${client.user?.name || client.user?.verifiedName || client.user?.id}`);
      module.exports = { Module, onMessage, onReady, modules, client };
      // ... (load plugins, send ready message etc.)
      
      const pluginFolder = "./WA_plugins/";
      if (fs.existsSync(pluginFolder)) {
        const files = fs.readdirSync(pluginFolder);
        files.forEach((file) => {
          if (file.endsWith(".js")) {
            const filePath = require("path").join(__dirname, pluginFolder, file); // Use absolute path
            try {
              require(filePath);
              console.log(`Loaded plugin: ${file}`);
            } catch (e) {
              console.error(`Error loading plugin ${file}:`, e);
            }
          }
        });
      } else {
        console.warn(`Plugin folder ${pluginFolder} not found.`);
      }


      // It's good practice to ensure client.user is available before sending messages
      if (client.user && client.user.id) {
         client.sendMessage(config.SUDO[0] || "919072215994@s.whatsapp.net", { // Send to first SUDO or fallback
            text: "✅ Dark Bot connected!",
         });
      } else {
        console.warn("client.user.id not available, cannot send startup message.");
      }


      // Initialize other parts of your application
      try {
        if (fs.existsSync("./TG_index.js")) require("./TG_index");
        if (fs.existsSync("./server/server.js")) require("./server/server");
      } catch (error) {
        console.error("Error loading TG_index or server:", error);
      }

      for (let readyHandler of onReadys) {
        try {
          await readyHandler.callback(client);
        } catch (e) {
          console.error("Error in onReady callback:", e);
        }
      }
    } else if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason[statusCode] || "Unknown";
      console.log("Connection closed. Reason:", reason, "Status Code:", statusCode);

      if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.badSession) {
        console.log(`Device Logged Out or Bad Session (${reason}). Deleting session files...`);
        try {
          if (fs.existsSync(SESSION_FOLDER_PATH)) {
             fs.readdirSync(SESSION_FOLDER_PATH).forEach(file => {
                try { fs.unlinkSync(path.join(SESSION_FOLDER_PATH, file)); }
                catch (unlinkErr) { console.error(`Failed to delete ${file}:`, unlinkErr); }
             });
             console.log("Session files deleted.");
          }
          console.log(`If using ${WA_CREDS_ENV_VAR_NAME}, clear it or get new one after rescan.`);
        } catch (err) { console.error("Error deleting session files:", err); }
        process.exit(1); 
      } else if ( [DisconnectReason.restartRequired, DisconnectReason.timedOut, DisconnectReason.connectionLost, DisconnectReason.connectionClosed].includes(statusCode) ) {
        console.log(`Connection issue (${reason}), attempting to reconnect...`);
        connect();
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        console.log("Connection replaced. Exiting.");
        process.exit(1);
      } else {
        console.log(`Unhandled disconnection (${reason}). Reconnecting...`);
        connect();
      }
    }
  });

  // --- Group Participants and Messages Upsert Handlers (Your existing logic) ---
  client.ev.on("group-participants.update", async (groupUpdate) => {
    try { // Added try-catch for the whole handler
      await welcomeDb.sync();
      const data = await welcomeDb.findAll();
      if (!data) {
        console.log("No welcome messages configured in DB.");
        return;
      }
      const jid = groupUpdate.id;
      let tt = data.find((c) => c.name === jid);
      if (tt && groupUpdate.action == "add") {
        let text = tt.data;
        const metadata = await client.groupMetadata(groupUpdate.id).catch(e => {
            console.error("Failed to get group metadata:", e);
            return null;
        });
        if (!metadata) return;

        const { subject, desc } = metadata;
        const participant = groupUpdate.participants[0];
        let picture;
        try {
            picture = await client.profilePictureUrl(participant, "image");
        } catch (e) {
            console.log("Could not get profile picture for welcome:", e.message);
            picture = null; // Default to no picture
        }

        text = text
          .replace("{user}", `@${participant.split("@")[0]}`)
          .replace("{subject}", `${subject}`)
          .replace("{desc}", `${desc || "No Description"}`)
          .replaceAll("\\n", `\n`);

        const mentions = [participant];
        if (text.match("{pp}") && picture) {
          text = text.replace("{pp}", ``).trim(); // Remove placeholder and trim
          await client.sendMessage(groupUpdate.id, {
            image: { url: picture },
            caption: text,
            mentions,
          });
        } else {
          text = text.replace("{pp}", ``).trim(); // Also remove if no picture
          await client.sendMessage(groupUpdate.id, {
            text: text,
            mentions,
          });
        }
      }
    } catch (e) {
      console.error("Error in group-participants.update:", e);
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

  
  return client;
};

connect().catch((e) => {
  console.error("🔴 Failed to connect to WhatsApp:", e);
  process.exit(1);
});