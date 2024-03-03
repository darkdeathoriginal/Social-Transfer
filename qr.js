const {
  default: makeWASocket,
  useMultiFileAuthState,
} = require("@adiwajshing/baileys");
const { default: pino } = require("pino");
require("dotenv").config();
const fs = require("fs");
const {WASESSION} = require("./config");

const credsFolder = "./session";
async function main() {
  try {
    if (!fs.existsSync(credsFolder)) {
      fs.mkdirSync(credsFolder);
    }
      if (WASESSION) {
        const buff = Buffer.from(WASESSION, "base64");
        fs.writeFileSync(`${credsFolder}/creds.json`, buff.toString("utf-8"));
      }
    const { state, saveCreds } = await useMultiFileAuthState(credsFolder);
    const client = makeWASocket({
      printQRInTerminal: true,
      auth: state,
      version: [2, 2308, 7],
      logger: pino({
         level: 'silent'
      }),
      browser: ['@dark / dark-bot', 'safari', '1.0.0'],
    });
    client.ev.on("creds.update", saveCreds);
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
        var st = Buffer.from(JSON.stringify(client.authState.creds)).toString(
          "base64"
        );
        console.log(st);
         process.exit()
      }
    });
   } catch (error) {
    console.log(error);
    throw new Error(error);
  }
}
main().catch((e) => {
  main();
});
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (err, origin) => {
  console.log(err);
  console.log(origin);
});
process.on("exit", (code) => {
  if(code!=2){
   main()
}
});
