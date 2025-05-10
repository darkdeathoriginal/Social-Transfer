const { google } = require("googleapis");
const { DriveDb } = require("./sql/drive");
const { onMessage } = require("../WA_index");
const { Semaphore } = require("../lib/helpers");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { getGoogleClient } = require("./utils/googleClient");

const INDIAN_TIMEZONE = "Asia/Kolkata";
const semaphore = new Semaphore(10);

onMessage(
  {
    pattern: "message",
    fromMe: false,
    desc: "Auto-upload to Google Drive",
    use: "utility",
  },
  async (m) => {
    if (!m.data || !m.data.message || m.key?.remoteJid === "status@broadcast") {
      return;
    }

    let authorizedGoogleClient;
    try {
      authorizedGoogleClient = await getGoogleClient(m.jid);
    } catch (e) {
      console.error(
        `[AutoDrive] Failed to get Google Client for ${m.jid}: ${e.message}`
      );

      return;
    }

    if (!authorizedGoogleClient) {
      return;
    }

    let driveSetup;
    try {
      driveSetup = await DriveDb.findOne({ where: { jid: m.jid } });
    } catch (dbError) {
      console.error(
        `[AutoDrive] Database error fetching DriveDb for ${m.jid}: ${dbError.message}`
      );
      await m.client.sendMessage(
        m.jid,
        {
          text: "Error accessing your Drive settings. Please try again later.",
        },
        { quoted: m.data }
      );
      return;
    }

    if (!driveSetup || !driveSetup.data || !driveSetup.data.FileId) {
      return;
    }
    const targetFolderId = driveSetup.data.FileId;

    const messageType = Object.keys(m.data.message)[0];
    let fileDetails;
    const timestamp = new Date()
      .toLocaleString("en-US", { timeZone: INDIAN_TIMEZONE })
      .replace(/[/:]/g, "-")
      .replace(/, /g, "_");

    switch (messageType) {
      case "imageMessage":
        fileDetails = {
          name: `IMG_${timestamp}.jpg`,
          mime: m.data.message.imageMessage.mimetype || "image/jpeg",
        };
        break;
      case "videoMessage":
        fileDetails = {
          name: `VID_${timestamp}.mp4`,
          mime: m.data.message.videoMessage.mimetype || "video/mp4",
        };
        break;
      case "audioMessage":
        const isPTT = m.data.message.audioMessage.ptt || false;
        fileDetails = {
          name: `${isPTT ? "PTT" : "AUD"}_${timestamp}.${
            isPTT ? "ogg" : "mp3"
          }`,
          mime:
            m.data.message.audioMessage.mimetype ||
            (isPTT ? "audio/ogg" : "audio/mpeg"),
        };
        break;
      case "documentMessage":
        fileDetails = {
          name: m.data.message.documentMessage.fileName || `DOC_${timestamp}`,
          mime:
            m.data.message.documentMessage.mimetype ||
            "application/octet-stream",
        };
        break;
      default:
        return;
    }

    if (m.data.message[messageType]?.viewOnce) {
      console.log(`[AutoDrive] Skipping viewOnce message for ${m.jid}.`);

      return;
    }

    console.log(
      `[AutoDrive] Preparing to upload for ${m.jid}: ${fileDetails.name} (${fileDetails.mime})`
    );

    try {
      await semaphore.acquire();

      const mediaStream = await downloadWhatsAppMedia(m.data);
      if (!mediaStream) {
        throw new Error("Failed to download media from WhatsApp.");
      }

      await uploadToDrive(authorizedGoogleClient, {
        name: fileDetails.name,
        mime: fileDetails.mime,
        stream: mediaStream,
        targetFolderId: targetFolderId,
      });

      await m.client.sendMessage(
        m.jid,
        { text: `✅ File "${fileDetails.name}" uploaded to Google Drive.` },
        { quoted: m.data }
      );
    } catch (e) {
      console.error(`[AutoDrive] Error during upload process for ${m.jid}:`, e);
      let userErrorMessage = "An error occurred while uploading your file. ";
      if (e.message && e.message.includes("insufficient permissions")) {
        userErrorMessage +=
          "Please check the bot's permissions for the target Google Drive folder.";
      } else if (e.message && e.message.includes("notFound")) {
        userErrorMessage +=
          "The target Google Drive folder might have been deleted or is inaccessible.";
      } else {
        userErrorMessage +=
          "Please try again or contact support if the error persists.";
      }
      await m.client.sendMessage(
        m.jid,
        { text: userErrorMessage },
        { quoted: m.data }
      );
    } finally {
      semaphore.release();
    }
  }
);

async function uploadToDrive(authorizedGcClient, fileData) {
  const drive = google.drive({ version: "v3", auth: authorizedGcClient });

  const requestBody = {
    name: fileData.name,

    parents: [fileData.targetFolderId],
  };
  const media = {
    mimeType: fileData.mime,
    body: fileData.stream,
  };

  try {
    console.log(
      `[uploadToDrive] Attempting to upload: ${fileData.name} to folder ${fileData.targetFolderId}`
    );
    const file = await drive.files.create({
      requestBody,
      media: media,
      fields: "id, name, webViewLink",
    });
    console.log(
      `[uploadToDrive] File uploaded successfully. ID: ${file.data.id}, Name: ${file.data.name}, Link: ${file.data.webViewLink}`
    );
    return file.data;
  } catch (error) {
    if (error.errors)
      console.error("[uploadToDrive] Google API Errors:", error.errors);
    console.error(
      `[uploadToDrive] Error uploading file "${fileData.name}":`,
      error.message
    );
    throw error;
  }
}

function downloadWhatsAppMedia(baileysMessageObject) {
  return new Promise(async (resolve, reject) => {
    try {
      const stream = await downloadMediaMessage(
        baileysMessageObject,
        "stream",
        {},
        {}
      );
      resolve(stream);
    } catch (error) {
      console.error(
        "[downloadWhatsAppMedia] Error downloading media:",
        error.message
      );
      reject(error);
    }
  });
}
