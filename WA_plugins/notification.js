const { client } = require("../WA_index");
require('dotenv').config();
const {google} = require('googleapis');
const fs = require('fs')
const {ClassDb,updateClass} = require("./sql/classroom")
const { Module } = require('../WA_index');
const { fromBuffer } = require('file-type')

const credsPath = "./creds.json"
const jid = "919072215994@s.whatsapp.net"
const RUN = process.env.NOTIFICATION? process.env.NOTIFICATION:false
let gcClients = {}
let array  ={}


async function main(obj){
    try{
    const tokenPath = `./${obj.name}.json`
    let gcClient;
    if(gcClients[obj.name]){
      gcClient = gcClients[obj.name]
    }
    else{
      const creds = JSON.parse(await fs.readFileSync(credsPath,"utf8"))
      const { client_id, client_secret, redirect_uris } = creds.web
      gcClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
      await authorize()
      gcClients[obj.name] = gcClient

    }
    // if (!fs.existsSync("./notif.json")) {
    //     await fs.writeFileSync("./notif.json", JSON.stringify({ id: "" }));
    // }
    const interval = setInterval(async()=>{
        const {cources,forward,state} = obj.data
        for(let i of cources){
        let haschange = false 
        let list = {}
        let announcement = (await listAnnouncements(i.id,gcClient))[0]
        let courseWork = (await listCourseWork(i.id,gcClient))[0]
        let courseWorkMaterial = (await listCourseWorkMaterials(i.id,gcClient))[0]
        
        if(announcement?.id && state[i.id]["announcement"] != announcement.id){
            state[i.id]["announcement"] = announcement.id
            haschange = true
            const {text} = announcement
            let msg = `${i.name}:\nNew announcement\n\n${text}`
            if(announcement.materials){
                msg+="\n\nMaterials:"
                let n = 1
                for(let i of announcement.materials){
                    if(i.driveFile){
                        const {id,title} = i.driveFile.driveFile
                        list[n]={id,title,name:obj.name} 
                        msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                        n++
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            let a = await client.sendMessage(forward,{text:msg})
            if(list[1]){
              array[a.key.id] = list
              list = []
            }
            console.log(msg);
        }
        if(courseWork?.id&&state[i.id]["courseWork"] != courseWork.id){
            state[i.id]["courseWork"] = courseWork.id
            haschange = true
            let msg = `${i.name}:\nNew course work\n\n${courseWork.title}`
            if(courseWork.description){
                msg+=`\nInstruction : ${courseWork.description}`
            }
            if(courseWork.dueDate){
                msg+=`\nDue date : ${courseWork.dueDate.day}-${courseWork.dueDate.month}-${courseWork.dueDate.year}`
            }

            if(courseWork.materials){
                msg+="\n\nMaterials:"
                let n = 1
                for(let i of courseWork.materials){
                    if(i.driveFile){
                      const {id,title} = i.driveFile.driveFile
                      list[n]={id,title,name:obj.name} 
                      msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                      n++
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            let a = await client.sendMessage(forward,{text:msg})
            if(list[1]){
              array[a.key.id] = list
              list = []
            }
            console.log(msg);
        }
        if(courseWorkMaterial?.id&&state[i.id]["courseWorkMaterial"] != courseWorkMaterial.id){
            state[i.id]["courseWorkMaterial"] = courseWorkMaterial.id
            haschange = true
            let msg = `${i.name}:\nNew material\n\n${courseWorkMaterial.title}`
            if(courseWorkMaterial.description){
                msg+=`\n${courseWorkMaterial.description}`
            }
            

            if(courseWorkMaterial.materials){
                msg+="\n\nMaterials:"
                let n =1
                for(let i of courseWorkMaterial.materials){
                    if(i.driveFile){
                      const {id,title} = i.driveFile.driveFile
                      list[n]={id,title,name:obj.name} 
                      msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                      n++
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            let a = await client.sendMessage(forward,{text:msg})
            if(list[1]){
              array[a.key.id] = list
              list = []
            }
            console.log(msg);
        }
        let data ={
          cources,
          forward,
          state
        }
        if(haschange){
          await updateClass(obj.name,data)

        }
        }
    }, 10000); 



    
    async function getAuthToken(){
        if (!fs.existsSync(tokenPath)) {
          return await client.sendMessage(jid,{text:"token not found"})
        }
    
        const raw = fs.readFileSync(tokenPath, { encoding: 'utf8' });
        return JSON.parse(raw);
      }
    
    function verifyAndUpdateToken(token) {
        const raw = fs.readFileSync(tokenPath, { encoding: 'utf8' });
        const json = JSON.parse(raw);
    
        if (token !== json.access_token) {
          json.access_token = token;
          fs.writeFileSync(tokenPath, JSON.stringify(json), { encoding: 'utf8' });
        }
      }

      async function authorize() {
        const authToken = await getAuthToken();
        gcClient.setCredentials(authToken);
        const { token } = await gcClient.getAccessToken();
        verifyAndUpdateToken(token);
      }

      
    }catch(e){
        console.log(e);
        await client.sendMessage('919072215994@s.whatsapp.net',{text:e})
        main()
    }
    
}
async function mn(){

  if(RUN&&RUN == "on"){
      await ClassDb.sync()
      let cources = await ClassDb.findAll()
      for(let i of cources){
        main(i)
  
      }
    }
}
mn()
async function listAnnouncements(COURSEID,gcClient) {
  const classroom = google.classroom({ version: 'v1', auth: gcClient });

  const allAnnouncements = [];

    const { data:{announcements} }  = await classroom.courses.announcements.list({
      courseId: COURSEID
    });
    if (announcements) {
      allAnnouncements.push(...announcements);
    }
  

  return allAnnouncements
}

async function listCourseWork(COURSEID,gcClient) {
  const classroom = google.classroom({ version: 'v1', auth: gcClient });

  const allCourseWork= [];

    const { data: { courseWork } } = await classroom.courses.courseWork.list({
      courseId: COURSEID
    });

    if (courseWork) {
      allCourseWork.push(...courseWork);
    }
  

  return allCourseWork
}
async function listCourseWorkMaterials(COURSEID,gcClient) {
  const classroom = google.classroom({ version: 'v1', auth: gcClient });

  const allCourseWork= [];

    const { data: { courseWorkMaterial } } = await classroom.courses.courseWorkMaterials.list({
      courseId: COURSEID
    });

    if (courseWorkMaterial) {
      allCourseWork.push(...courseWorkMaterial);
    }
  

  return allCourseWork
}
async function getCources() {

  const classroom = google.classroom({ version: 'v1', auth: gcClient });

  const { data: { courses } } = await classroom.courses.list();

  return courses
}
async function getFile(fileId,gcClient){
  const drive = google.drive({ version: 'v3', auth: gcClient });

  try {


    const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });

    return Buffer.from(res.data)

  } catch (err) {
    console.log(err);
    return null;
  }
}

Module(
  { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
  async (m, match) => {
    if(array[m.quoted?.id]){
      var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false
      if (!no) throw "_Reply must be  a number_";
      let data = array[m.quoted.id]
      if(data[no]){
        const {id,title,name} = data[no]
        let buffer = await getFile(id,gcClients[name])
        let {mime} = await fromBuffer(buffer)
        this.state = false
        return await m.client.sendMessage(m.jid,{document:buffer,fileName:title,mimetype:mime})
      }
      else{
        return await m.send("invalid number")
      }
    }
    else{
      return 0;
    }
  }
);

module.exports = {getFile,listAnnouncements,listCourseWorkMaterials,listCourseWork,gcClients}