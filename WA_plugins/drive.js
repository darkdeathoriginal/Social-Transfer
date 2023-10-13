const { Module } = require('../WA_index');
const { google } = require('googleapis');
const fs = require('fs');
const { DriveDb, addDrive, deleteDrive } = require("./sql/drive");
const {getCode,closeServer} = require("./utils/server");
const { addShort } = require('./utils/urlshortner');

const credsPath = "./creds.json";
const SCOPES = ['https://www.googleapis.com/auth/drive']

let state = null;
let jid = null;
let name = null;
let client = null;
let FILEID = null;

const states = {
  creds: {state: 'creds'},
  name: {state: 'name'}
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
             await m.send("deleted succesfully")
             process.exit(0);
        }else{
            return await m.send("No account found")
        }
    }
    else{
        return await states.name.handle(m)
    }
  }
});
    
  states.name.handle =async (m)=> {
    name = m.jid
    await closeServer()
    let creds = require("../creds.json")
    const { client_id, client_secret, redirect_uris } = creds.web
    client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

    const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt:"consent",
        scope:SCOPES
      });
    const id = await addShort(authUrl)
    const url = `${SERVER}/short/`+id
    await m.send(`Open this URL to connect your account: ${url}`);
    let code = await getCode()
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
  await m.send("Successfully set account");
  FILEID = await createFolder()
  let data = {
    jid :m.jid,
    FileId:FILEID,
    name:name
  }
    await addDrive(name,data)
    process.exit(0);
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
     return file.data.id
      
}

