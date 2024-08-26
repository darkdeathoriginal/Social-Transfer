const { client } = require("../WA_index");
require("dotenv").config();
const { google } = require("googleapis");
const fs = require("fs");
const { DriveDb } = require("./sql/drive");
const { onMessage } = require("../WA_index");
const { Readable } = require("stream");
const {Semaphore} = require("../lib/helpers");

const credsPath = "./creds.json";
const RUN = process.env.NOTIFICATION ? process.env.NOTIFICATION : false;
const jid = "919072215994@s.whatsapp.net";
let gcClients = {};
let array = {};
const indianTimeZone = "Asia/Kolkata";
const semaphore = new Semaphore(10)


async function main(obj) {
  try {
    const tokenPath = `./${obj.name}.json`;
    let gcClient;
    if (gcClients[obj.name]) {
      gcClient = gcClients[obj.name];
    } else {
      const creds = JSON.parse(await fs.readFileSync(credsPath, "utf8"));
      const { client_id, client_secret, redirect_uris } = creds.web;
      gcClient = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris
      );
      await authorize();
      gcClients[obj.name] = gcClient;
    }

    async function getAuthToken() {
      if (!fs.existsSync(tokenPath)) {
        return await client.sendMessage(jid, { text: "token not found" });
      }

      const raw = fs.readFileSync(tokenPath, { encoding: "utf8" });
      return JSON.parse(raw);
    }

    function verifyAndUpdateToken(token) {
      const raw = fs.readFileSync(tokenPath, { encoding: "utf8" });
      const json = JSON.parse(raw);

      if (token !== json.access_token) {
        json.access_token = token;
        fs.writeFileSync(tokenPath, JSON.stringify(json), { encoding: "utf8" });
      }
    }

    async function authorize() {
      const authToken = await getAuthToken();
      gcClient.setCredentials(authToken);
      const { token } = await gcClient.getAccessToken();
      verifyAndUpdateToken(token);
    }
  } catch (err) {
    console.log(err);
  }
}

async function mn() {
  await DriveDb.sync();
  let data = await DriveDb.findAll();
  for (let i of data) {
    main(i);
  }
}
mn();

onMessage(
  { pattern: "message", fromMe: false, desc: "Start command", use: "utility" },
  async (m) => {
    if (gcClients[m.jid]) {
      try {
        let ob = (await DriveDb.findAll()).find((c) => c.name === m.jid);
        const messageType = Object.keys(m.data.message)[0];
        let fileDetails;

        switch (messageType) {
          case "imageMessage":
            fileDetails = {
              name: `${new Date().toLocaleString("en-US", {
                timeZone: indianTimeZone,
              })}.jpg`,
              mime: "image/jpeg",
            };
            break;
          case "videoMessage":
            fileDetails = {
              name: `${new Date().toLocaleString("en-US", {
                timeZone: indianTimeZone,
              })}.mp4`,
              mime: "video/mp4",
            };
            break;
          case "audioMessage":
            fileDetails = {
              name: `${new Date().toLocaleString("en-US", {
                timeZone: indianTimeZone,
              })}.mp3`,
              mime: "audio/mpeg",
            };
            break;
          case "documentMessage":
            fileDetails = {
              name: m.data.message.documentMessage.fileName,
              mime: m.data.message.documentMessage.mimetype,
            };
            break;
          default:
            return;
        }
        await semaphore.acquire();
        if (fileDetails) {
          const stream = await download(m.data);
          await upload(gcClients[m.jid], {
            ...fileDetails,
            stream,
            fileid: ob.data.FileId,
          });
          await m.client.sendMessage(
            m.jid,
            { text: "File uploaded" },
            { quoted: m.data }
          );
        }
      } catch (e) {
        console.error(e);
        await m.client.sendMessage(
          m.jid,
          {
            text: "An error occurred. Please try again or contact the developer if the error persists.",
          },
          { quoted: m.data }
        );
      }finally{
        semaphore.release()
      }
    }
  }
);

async function upload(client, data) {
  const drive = google.drive({ version: "v3", auth: client });
  const requestBody = {
    name: data.name,
    fields: "id",
    parents: [data.fileid],
  };
  const media = {
    mimeType: data.mime,
    body: data.stream,
  };
  try {
    const file = await drive.files.create({
      requestBody,
      media: media,
    });
    console.log("File Id:", file.data.id);
    return file.data.id;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { Semaphore } = require("../lib/helpers");

function download(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = await downloadMediaMessage(file, "stream", {}, {});
      resolve(stream);
    } catch (error) {
      reject(error);
    }
  });
}
