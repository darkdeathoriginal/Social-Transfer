const { google } = require("googleapis");
const { DriveDb } = require("./sql/drive");
const { onMessage } = require("../WA_index");
const { Semaphore } = require("../lib/helpers");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getGoogleClient, gcClients } = require("./utils/googleClient");

const indianTimeZone = "Asia/Kolkata";
const semaphore = new Semaphore(10);

async function mn() {
  await DriveDb.sync();
  let data = await DriveDb.findAll();
  for (let i of data) {
    await getGoogleClient(i.name);
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
      } finally {
        semaphore.release();
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
