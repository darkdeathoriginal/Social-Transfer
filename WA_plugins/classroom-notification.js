const { Module ,onMessage } = require('../WA_index');
const { google } = require('googleapis');
const fs = require('fs');
const { ClassDb, addClass, updateClass, deleteClass } = require("./sql/classroom");
const { getFile, listAnnouncements, listCourseWorkMaterials, listCourseWork, gcClients, getCourses} = require("./notification");
const { fromBuffer } = require('file-type');
const {getCode} = require("./utils/server");
const { addShort } = require('./utils/urlshortner');

const credsPath = "./creds.json";
const SCOPES = ['https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.coursework.me.readonly', 'https://www.googleapis.com/auth/classroom.coursework.students.readonly', 'https://www.googleapis.com/auth/classroom.push-notifications', 'https://www.googleapis.com/auth/classroom.announcements.readonly', 'https://www.googleapis.com/auth/classroom.courseworkmaterials', 'https://www.googleapis.com/auth/drive.readonly'];

let state = null;
let jid = null;
let DATA = null;
let name = null;
let client = null;
let forward = null;
let cources = null;

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

Module({ pattern: 'classroom', fromMe: true, desc: 'notification setup command', use: 'utility' }, async (m, match) => {
  if (!fs.existsSync(credsPath)) {
    state = states.creds.state;
    jid = m.jid;
    return await m.send("Please send the credentials.");
  } else {
    let msg = '1. Add new notification\n' +
              '2. Change information\n' +
              '3. Remove notification\n' +
              '4. Get notification data';
    state = states.menu.state;
    jid = m.jid;
    m.send(msg);
  }
});

onMessage({ pattern: "message", fromMe: true, desc: "Start command", use: "utility" }, async (m, match) => {
  if (jid == m.jid && state && m.message !== ".test") {
    if (m.message == "stop") {
      state = null;
      return;
    }

    try {
      if(states[state]){
        return await states[state].handle(m)
      }
      else{
        console.log("else");
        return 0;
      }
    } catch (error) {
      console.error('Error occurred:', error);
    }
  }
});

states.creds.handle =async (m)=> {
  let creds = JSON.parse(m.message);
  await fs.writeFileSync(credsPath, JSON.stringify(creds), { encoding: 'utf8' });
  state = null;
  await m.send(`Successfully set credentials.`);
}

states.options.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false;
  if (!no) throw "_Reply must be a number_";
  if (no == "0") {
    cources = Object.values(DATA);
    state = states.jid.state;
    await m.send("Send the jid for notification.\nType 'this' for using the current jid");
  } else if (DATA[no]) {
    cources = [DATA[no]];
    state = states.jid.state;
    await m.send("Send the jid for notification.\nType 'this' for using the current jid");
  } else {
    state = null;
    await m.send("Invalid option");
  }
}

states.menu.handle = async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false;
  if (!no) throw "_Reply must be a number_";
  if (no == '1') {
    state = states.name.state;
    await m.send("Give a name");
  } else if (no == '2') {
    return await handleMenu(m,states.query.state)
  } else if (no == '3') {
    return await handleMenu(m,states.delete.state)
  } else if (no == '4') {
    return await handleMenu(m,states.clist.state)
  } else {
    state = null;
    await m.send("Invalid option");
  }
}

states.name.handle =async (m)=> {
    name = m.message
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
  state = states.options.state;
  await m.send("Successfully set notification");
  let courses = await getCourses(client);
  let n = 1;
  let data = {};
  let msg = '';
  for (let i of (courses)) {
    msg += `${n}. ${i.descriptionHeading} (${i.id})\n`;
    data[n] = { name: i.descriptionHeading, id: i.id };
    n++;
  }
  msg += `0. For all courses`;
  DATA = data;
  await m.send(msg);

}

states.jid.handle =async (m)=> {
  ClassDb.sync()
  let text = m.message
  if(text == "this"){
    forward = m.jid
    let c = {}
    for(let i of cources){
      c[i.id]={}
    }
    let data = {
                cources:cources,
                forward:forward,
                state:c
              }
    await addClass(name,data)
    await m.send("done")
    process.exit(0);
  }
  else{
    forward = text
    for(let i of cources){
      c[i.id]={}
    }
    let data = {
      courses:cources,
      forward:forward,
      state:c
    }
    await addClass(name,data)
  }
}

states.query.handle = async(m)=>{
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(DATA[no]){
    name = DATA[no].name
    DATA = DATA[no].data
    state = states.newjid.state
    return await m.send("Enter new jid")
  }
  else{
    state = false
    return await m.send("Invalid option")
  }
}
states.newjid.handle =async (m)=> {
  let jid = m.message
  DATA.forward = jid
  let a = await updateClass(name,DATA)
  state = false
  
  await m.send(a?"Succesfully changed jid":"error")
  process.exit(0);
}
states.delete.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(DATA[no]){
    name = DATA[no].name
    await deleteClass(name)
    state = false
    await fs.unlinkSync(`./${name}.json`)
    await m.send("succesfully removed")
    process.exit(0);

  }
  else{
    state = false
    await m.send("Invalid option")
  }
}

states.clist.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(DATA[no]){
    let cources = DATA[no].data.cources
    name = DATA[no].name
    state = states.ccources.state
    let msg =''
    let n = 1
    let data = {}
    for(let i of cources){
      msg += `${n}. ${i.name}\n`
      data[n]= i
      n++
    }
    DATA = data
    return await m.send(msg)
  }
  else{
    state = false
    await m.send("Invalid option")
  }

}

states.ccources.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(no == '0'||DATA[no]){
    DATA = DATA[no]?DATA[no]:DATA
    state = states.dtype.state
    let msg = '1. announcement\n'+
              '2. courseWork\n'+
              '3. courseWorkMaterial'
    return await m.send(msg)
  }
  else{
    state = false
    await m.send("Invalid option")
  }
}

states.dtype.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(no =="1"){
    let list = getDrive(await listAnnouncements(DATA.id,gcClients[name]))
    return await handleDlist(m,list)

  }
  else if(no =="2"){
    let list = getDrive(await listCourseWork(DATA.id,gcClients[name]))
    return await handleDlist(m,list)
  }
  else if(no =="3"){
    let list = getDrive(await listCourseWorkMaterials(DATA.id,gcClients[name]))
    return await handleDlist(m,list)
  }
  else{
    state = false
    await m.send("Invalid option")
  }
}

states.download.handle =async (m)=> {
  var no = /\d+/.test(m.message) ? m.message.match(/\d+/)[0] : false
  if (!no) throw "_Reply must be  a number_";
  if(no == '0'){
    for(let i of Object.values(DATA)){
      handleDl(m,i)
    }
  }
  else if(DATA[no]){
    return await handleDl(m,DATA[no])
  }
  else{
    state = false
    await m.send("Invalid option")
  }
}


async function handleDlist(m,list){
  let msg =''
  let n = 1
  let data = {}
  for(let i of list){
    msg+=`${n}. ${i.driveFile.driveFile.title}\n`
    data[n] = i.driveFile.driveFile
    n++
  }
  if(list.length<1){
    state = states.ccources.state
    return await m.send("no file found\nenter '0' to go back")
  }
  msg += `0. For all files`
  state = states.download.state
  DATA = data
  return await m.send(msg)
}
async function handleDl(m,obj){
  const {title,id} = obj
  let buffer = await getFile(id,gcClients[name])
  let {mime} = await fromBuffer(buffer)
  state = false
  return await m.client.sendMessage(m.jid,{document:buffer,fileName:title,mimetype:mime})
} 
async function handleMenu(m,st){
  let array = await ClassDb.findAll()
  let msg = '';
    let n = 1;
    let arr = {};
    for (let i of array) {
      msg += `${n}. ${i.name}\n`;
      arr[n] = i;
      n++;
    }
    DATA = arr;
    state = st;
    return await m.send(msg);
} 

function getDrive(array){
  let list = []
  array.forEach((e) => {
    let a = e.materials?.filter((l) => l.driveFile);
    if (a) {
      list.push(...a);
    }
  });
  return list
}
