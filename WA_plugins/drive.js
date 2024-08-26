const { Module, onMessage } = require('../WA_index');
const { google } = require('googleapis');
const fs = require('fs');
const { DriveDb, addDrive, deleteDrive } = require("./sql/drive");
const {getCode,closeServer} = require("./utils/server");
const { addShort } = require('./utils/urlshortner');
const { SERVER } = require('../config');
const { getGoogleClient, createClient, createUser, setClient } = require('./utils/googleClient');

const credsPath = "./creds.json";
const SCOPES = ['https://www.googleapis.com/auth/drive']

let state = null;
let jid = null;
let name = null;
let client = null;
let FILEID = null;

let moveFileState = null;
let moveFileData = {};

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
        jid = m.jid;
        return states.name.handle(m);
    }
  }
});

Module({ pattern: 'movefile', fromMe: false, desc: 'Move files between folders', use: 'utility' }, async (m, match) => {
  const userDrive = await DriveDb.findOne({ where: { name: m.jid } });
  if (!userDrive) {
    return await m.send("Please set up your Google Drive first using the 'drive' command.");
  }

  moveFileState = 'selectSource';
  moveFileData = { jid: m.jid };
  await listFoldersForMove(m, "Please select the source folder:");
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

  if (m.jid === moveFileData.jid && moveFileState) {
    if (m.message.toLowerCase() === 'stop') {
      moveFileState = null;
      moveFileData = {};
      return await m.send("Move file process stopped.");
    }
    try {
      await handleMoveFileState(m);
    } catch (error) {
      console.error("Error occurred:", error);
      await m.send("An error occurred. Please try again.");
      moveFileState = null;
      moveFileData = {};
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
  client = createClient()

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: "consent",
    scope: SCOPES
  });
  const id = await addShort(authUrl);
  const url = `${SERVER}/short/`+id;
  await m.send(`Open this URL to connect your account: ${url}`);
  let code = await getCode();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  await createUser(name, tokens);
  setClient(name, client);
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
    FILEID = await createFolder(m);
    await m.send(`New folder created with ID: ${FILEID}`);
    return await finishSetup(m);
  } else {
    await m.send("Invalid choice. Please reply with 'existing' or 'new'.");
  }
};

states.selectFolder.handle = async (m) => {
  const choice = parseInt(m.message);
  const folders = await listFolders(m);

  if (choice > 0 && choice <= folders.length) {
    FILEID = folders[choice - 1].id;
    await m.send(`Selected folder: ${folders[choice - 1].name}`);
    return await finishSetup(m);
  } else {
    await m.send("Invalid selection. Creating a new folder.");
    FILEID = await createFolder(m);
    await m.send(`New folder created with ID: ${FILEID}`);
    return await finishSetup(m);
  }
};

async function createFolder(m){
    const gcClient = await getGoogleClient(m.jid);
    const drive = google.drive({version: 'v3', auth: gcClient});
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

async function handleMoveFileState(m) {
  switch (moveFileState) {
    case 'selectSource':
      await handleSourceSelection(m);
      break;
    case 'selectDestination':
      await handleDestinationSelection(m);
      break;
    case 'createFolder':
      await handleCreateFolder(m);
      break;
    case 'selectParentFolder':
      await handleParentFolderSelection(m);
      break;
    case 'enterUser':
      await handleUserInput(m);
      break;
    case 'confirmMove':
      await handleConfirmMove(m);
      break;
    case 'selectDestinationFolder':
      await handleDestinationFolderSelection(m);
      break;
  }
}

async function moveFiles(m) {
  const gcClient = await getGoogleClient(m.jid);
  const drive = google.drive({version: 'v3', auth: gcClient});
  
  try {
    const query = `'${moveFileData.sourceFolder}' in parents and ('${moveFileData.user}' in owners)`;    
    const files = await drive.files.list({
      q: query,
      fields: 'files(id, name, modifiedTime, owners)',
      spaces: 'drive'
    });

    if (files.data.files.length === 0) {
      return await m.send("No files found matching the criteria.");
    }

    let movedCount = 0;
    for (const file of files.data.files) {
      try {
        await drive.files.update({
          fileId: file.id,
          addParents: moveFileData.destinationFolder,
          removeParents: moveFileData.sourceFolder,
          fields: 'id, parents',
        });
        movedCount++;
      } catch (updateError) {
        console.error(`Error moving file ${file.id}:`, updateError);
      }
    }

    await m.send(`Successfully moved ${movedCount} out of ${files.data.files.length} files.`);
  } catch (error) {
    console.error("Error moving files:", error);
    if (error.errors && error.errors.length > 0) {
      await m.send(`An error occurred while moving files: ${error.errors[0].message}`);
    } else {
      await m.send("An error occurred while moving files. Please check your folder IDs and permissions.");
    }
  }
}

async function listFolders(m) {
  const gcClient = await getGoogleClient(m.jid);
  const drive = google.drive({version: 'v3', auth: gcClient});
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    fields: 'files(id, name)',
    spaces: 'drive',
  });
  return res.data.files;
}

async function handleSourceSelection(m) {
  const choice = parseInt(m.message);
  const folders = await listFolders(m);
  if (choice > 0 && choice <= folders.length) {
    moveFileData.sourceFolder = folders[choice - 1].id;
    moveFileState = 'selectDestination';
    await m.send("Source folder selected. Now choose the destination:");
    await m.send("1. Select an existing folder\n2. Create a new folder in root\n3. Create a new folder inside another folder");
  } else {
    await m.send("Invalid selection. Please try again.");
  }
}

async function handleDestinationSelection(m) {
  const choice = parseInt(m.message);
  switch (choice) {
    case 1:
      await listFoldersForMove(m, "Select the destination folder:");
      moveFileState = 'selectDestinationFolder';
      break;
    case 2:
      moveFileState = 'createFolder';
      moveFileData.createInRoot = true;
      await m.send("Enter the name for the new folder:");
      break;
    case 3:
      moveFileState = 'selectParentFolder';
      await listFoldersForMove(m, "Select the parent folder for the new folder:");
      break;
    default:
      await m.send("Invalid choice. Please select 1, 2, or 3.");
  }
}

async function handleCreateFolder(m) {
  const folderName = m.message;
  const gcClient = await getGoogleClient(m.jid);
  const drive = google.drive({version: 'v3', auth: gcClient});
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: moveFileData.createInRoot ? [] : [moveFileData.parentFolder]
  };
  
  const file = await drive.files.create({
    resource: fileMetadata,
    fields: 'id',
  });
  
  moveFileData.destinationFolder = file.data.id;
  moveFileState = 'enterUser';
  await m.send(`New folder "${folderName}" created. Now enter the user email or ID:`);
}

async function handleParentFolderSelection(m) {
  const choice = parseInt(m.message);
  const folders = await listFolders(m);
  if (choice > 0 && choice <= folders.length) {
    moveFileData.parentFolder = folders[choice - 1].id;
    moveFileState = 'createFolder';
    moveFileData.createInRoot = false;
    await m.send("Parent folder selected. Enter the name for the new folder:");
  } else {
    await m.send("Invalid selection. Please try again.");
  }
}

async function handleUserInput(m) {
  const userInput = m.message.trim();
  if (!userInput.includes('@')) {
    moveFileData.user = `${userInput}@gmail.com`;
  } else {
    moveFileData.user = userInput;
  }
  moveFileState = 'confirmMove';
  await m.send(`Ready to move files from ${moveFileData.sourceFolder} to ${moveFileData.destinationFolder} for user ${moveFileData.user}. Type 'confirm' to proceed or 'stop' to cancel.`);
}

async function handleConfirmMove(m) {
  if (m.message.toLowerCase() === 'confirm') {
    await moveFiles(m);
  } else {
    await m.send("Move operation cancelled.");
  }
  moveFileState = null;
  moveFileData = {};
}

async function listFoldersForMove(m, message) {
  const folders = await listFolders(m);
  let folderList = `${message}\n`;
  folders.forEach((folder, index) => {
    folderList += `${index + 1}. ${folder.name}\n`;
  });
  await m.send(folderList + "\nReply with the number of the folder you want to select.");
}
async function handleDestinationFolderSelection(m) {
  const choice = parseInt(m.message);
  const folders = await listFolders(m);
  if (choice > 0 && choice <= folders.length) {
    moveFileData.destinationFolder = folders[choice - 1].id;
    moveFileState = 'enterUser';
    await m.send(`Destination folder selected: ${folders[choice - 1].name}\nNow enter the user email:`);
  } else {
    await m.send("Invalid selection. Please try again.");
    await listFoldersForMove(m, "Select the destination folder:");
  }
}