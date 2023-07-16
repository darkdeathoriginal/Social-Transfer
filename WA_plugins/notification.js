const { client } = require("../WA_index");
require('dotenv').config();
const {google} = require('googleapis');
const fs = require('fs')
const {ClassDb, addClass ,updateClass} = require("./sql/classroom")

const credsPath = "./creds.json"
const jid = "919072215994@s.whatsapp.net"
const RUN = process.env.NOTIFICATION? process.env.NOTIFICATION:false


async function main(obj){
    try{
    const tokenPath = `./${obj.name}.json`
    const creds = JSON.parse(await fs.readFileSync(credsPath,"utf8"))
    const { client_id, client_secret, redirect_uris } = creds.web
    const gcClient = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
    await authorize()
    // if (!fs.existsSync("./notif.json")) {
    //     await fs.writeFileSync("./notif.json", JSON.stringify({ id: "" }));
    // }
    const interval = setInterval(async()=>{
        const {cources,forward,state} = obj.data
        for(let i of cources){
        let announcement = (await listAnnouncements(i.id))[0]
        let courseWork = (await listCourseWork(i.id))[0]
        let courseWorkMaterial = (await listCourseWorkMaterials(i.id))[0]
        
        if(announcement?.id && state[i.id]["announcement"] != announcement.id){
            state[i.id]["announcement"] = announcement.id
            
            const {text} = announcement
            let msg = `${i.name}:\nNew announcement\n\n${text}`
            if(announcement.materials){
                msg+="\n\nMaterials:"
                for(let i of announcement.materials){
                    if(i.driveFile){
                        const {id,title} = i.driveFile.driveFile
                        msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            await client.sendMessage(forward,{text:msg})
            console.log(msg);
        }
        if(courseWork?.id&&state[i.id]["courseWork"] != courseWork.id){
            state[i.id]["courseWork"] = courseWork.id
            
            let msg = `${i.name}:\nNew course work\n\n${courseWork.title}`
            if(courseWork.description){
                msg+=`\nInstruction : ${courseWork.description}`
            }
            if(courseWork.dueDate){
                msg+=`\nDue date : ${courseWork.dueDate.day}-${courseWork.dueDate.month}-${courseWork.dueDate.year}`
            }

            if(courseWork.materials){
                msg+="\n\nMaterials:"
                for(let i of courseWork.materials){
                    if(i.driveFile){
                        const {id,title} = i.driveFile.driveFile
                        msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            await client.sendMessage(forward,{text:msg})
            console.log(msg);
        }
        if(courseWorkMaterial?.id&&state[i.id]["courseWorkMaterial"] != courseWorkMaterial.id){
            state[i.id]["courseWorkMaterial"] = courseWorkMaterial.id
            
            let msg = `${i.name}:\nNew material\n\n${courseWorkMaterial.title}`
            if(courseWorkMaterial.description){
                msg+=`\n${courseWorkMaterial.description}`
            }
            

            if(courseWorkMaterial.materials){
                msg+="\n\nMaterials:"
                for(let i of courseWorkMaterial.materials){
                    if(i.driveFile){
                        const {id,title} = i.driveFile.driveFile
                        msg+=`\n${title} : https://drive.google.com/uc?id=${id}&export=download`
                    }
                    if(i.link){
                        msg+=`\n${i.link.url}`
                    }
                }
            }
            await client.sendMessage(forward,{text:msg})
            console.log(msg);
        }
        let data ={
          cources,
          forward,
          state
        }
          await updateClass(obj.name,data)
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

      async function listAnnouncements(COURSEID) {
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

      async function listCourseWork(COURSEID) {
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
      async function listCourseWorkMaterials(COURSEID) {
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