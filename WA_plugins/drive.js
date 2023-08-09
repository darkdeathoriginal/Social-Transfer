const { Module } = require('../WA_index');
const { google } = require('googleapis');
const fs = require('fs');
const { DriveDb, addDrive, updateDrive, deleteDrive } = require("./sql/drive");
const { fromBuffer } = require('file-type');
const {getCode} = require("./utils/server")

const credsPath = "./creds.json";
const SCOPES = ['https://www.googleapis.com/auth/drive']

let state = null;
let jid = null;
let DATA = null;
let name = null;
let client = null;
let forward = null;
let cources = null;
let FILEID = null;

const states = {
  creds: {state: 'creds'},
  options: {state: 'options'},
  menu: {state: 'menu'},
  name: {state: 'name'},
  jid: {state: 'jid'},
  query: {state: 'query'},
  delete: {state: 'delete'},
  newjid: {state: 'newjid'},
  clist: {state: 'clist'},
  ccources: {state: 'ccources'},
  dtype: {state: 'dtype'},
  download: {state: 'download'}
};

Module({ pattern: 'drive ?(.*)', fromMe: true, desc: 'notification setup command', use: 'utility' }, async (m, match) => {
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

  states.creds.handle =async (m)=> {
    let creds = JSON.parse(m.text);
    await fs.writeFileSync(credsPath, JSON.stringify(creds), { encoding: 'utf8' });
    state = null;
    return await m.send(`Successfully set credentials.`);
  }
  
  states.menu.handle = async (m)=> {
    var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false;
    if (!no) throw "_Reply must be a number_";
    if (no == '1') {
      state = states.name.state;
      return await states.name.handle(m)
    } else if (no == '2') {
      return await handleMenu(m,states.delete.state)
    } else {
      state = null;
      await m.send("Invalid option");
    }
  }
  
  states.name.handle =async (m)=> {
    name = m.jid
    let creds = require("../creds.json")
    const { client_id, client_secret, redirect_uris } = creds.web
    client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

    const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt:"consent",
        scope:SCOPES
      });
    await m.send(`Open this URL to connect your account: ${authUrl}`);
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
  state = states.options.state;
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
