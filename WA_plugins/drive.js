const { Module, onMessage } = require('../WA_index');
const { google } = require('googleapis');
const fs = require('fs');
const { DriveDb, addDrive, deleteDrive } = require("./sql/drive");
const {getCode,closeServer} = require("./utils/server");
const { addShort } = require('./utils/urlshortner');
const { SERVER } = require('../config');

const credsPath = "./creds.json";
const SCOPES = ['https://www.googleapis.com/auth/drive']

let state = null;
let jid = null;
let name = null;
let client = null;
let FILEID = null;

const states = {
  creds: { state: 'creds' },
  name: { state: 'name' },
  folderChoice: { state: 'folderChoice' },
  selectFolder: { state: 'selectFolder' }
};

Module({ pattern: 'drive', fromMe: false, desc: 'notification setup command', use: 'utility' }, async (m, match) => {
  if (!fs.existsSync(credsPath)) {
    state = states.creds.state;
    jid = m.jid;
    return await m.send("Please send the credentials.");
  } else {
    if(match[1] == "del"){
        let ob = (await DriveDb.findAll()).find(c => c.name === m.jid);
        if(ob){
            await deleteDrive(m.jid)
            await fs.unlinkSync(`./${m.jid}.json`)
             await m.send("deleted successfully")
             process.exit(0);
        }else{
            return await m.send("No account found")
        }
    }
    else{
        state = states.name.state;
        jid = m.jid;
    }
  }
});

onMessage({ pattern: 'message', fromMe: false }, async (m, match) => {
  if (jid == m.jid && state) {
    if (m.message.toLowerCase() === 'stop') {
      state = null;
      return await m.send("Setup process stopped.");
    }

    try {
      if (states[state]) {
        return await states[state].handle(m);
      }
    } catch (error) {
      console.error("Error occurred:", error);
      await m.send("An error occurred. Please try again.");
      state = null;
    }
  }
});

states.creds.handle = async (m) => {
  let creds = JSON.parse(m.message);
  await fs.writeFileSync(credsPath, JSON.stringify(creds), { encoding: 'utf8' });
  state = states.name.state;
};

states.name.handle = async (m) => {
  name = m.jid;
  let creds = require("../creds.json");
  const { client_id, client_secret, redirect_uris } = creds.web;
  client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: "consent",
    scope: SCOPES
  });
  const id = await addShort(authUrl);
  const url = `${SERVER}/short/`+id;
  await m.send(`Open this URL to connect your account: ${url}`);
  let code = await getCode();
  let path = `./${name}.json`;
  const { tokens } = await client.getToken(code);

  if (fs.existsSync(path)) {
    if (!tokens.refresh_token) {
      const raw = await fs.readFileSync(path, { encoding: 'utf8' });
      const json = JSON.parse(raw);
      tokens.refresh_token = json.refresh_token;
    }
  }

  await fs.writeFileSync(path, JSON.stringify(tokens), { encoding: 'utf8' });
  client.setCredentials(tokens);
  await m.send("Account set successfully.");
  
  state = states.folderChoice.state;
  await m.send("Do you want to select an existing folder or create a new one? Reply with 'existing' or 'new'.");
};

states.folderChoice.handle = async (m) => {
  const choice = m.message.toLowerCase();
  if (choice === 'existing') {
    state = states.selectFolder.state;
    return await listFolders(m);
  } else if (choice === 'new') {
    FILEID = await createFolder();
    await m.send(`New folder created with ID: ${FILEID}`);
    return await finishSetup(m);
  } else {
    await m.send("Invalid choice. Please reply with 'existing' or 'new'.");
  }
};

states.selectFolder.handle = async (m) => {
  const choice = parseInt(m.message);
  const drive = google.drive({version: 'v3', auth: client});
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const folders = res.data.files;
  if (choice > 0 && choice <= folders.length) {
    FILEID = folders[choice - 1].id;
    await m.send(`Selected folder: ${folders[choice - 1].name}`);
    return await finishSetup(m);
  } else {
    await m.send("Invalid selection. Creating a new folder.");
    FILEID = await createFolder();
    await m.send(`New folder created with ID: ${FILEID}`);
    return await finishSetup(m);
  }
};

async function listFolders(m) {
  const drive = google.drive({version: 'v3', auth: client});
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const folders = res.data.files;
  if (folders.length === 0) {
    await m.send("No folders found. Creating a new folder.");
    FILEID = await createFolder();
    await m.send(`New folder created with ID: ${FILEID}`);
    return await finishSetup(m);
  }

  let folderList = "Available folders:\n";
  folders.forEach((folder, index) => {
    folderList += `${index + 1}. ${folder.name}\n`;
  });

  await m.send(folderList + "\nReply with the number of the folder you want to select.");
}

async function createFolder(){
    const drive = google.drive({version: 'v3', auth:client});
    const fileMetadata = {
        name: 'Drive_Bot',
        mimeType: 'application/vnd.google-apps.folder',
    };
    
    const file = await drive.files.create({
        resource: fileMetadata,
        fields: 'id',
    });
    return file.data.id;
}

async function finishSetup(m) {
  let data = {
    jid: m.jid,
    FileId: FILEID,
    name: name
  }
  await addDrive(name, data);
  state = null;
  await m.send("Setup completed successfully.");
}