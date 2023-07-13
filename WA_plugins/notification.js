const { client } = require("../WA_index");
require('dotenv').config();
const {google} = require('googleapis');
const fs = require('fs')

const credsPath = "./creds.json"
const tokenPath = './token.json'
const COURSEID = 615911226063
const jid = "919072215994@s.whatsapp.net"
const RUN = process.env.NOTIFICATION? process.env.NOTIFICATION:false


async function main(){
    try{
    const creds = JSON.parse(await fs.readFileSync(credsPath,"utf8"))
    const { client_id, client_secret, redirect_uris } = creds.web
    const client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);
    await authorize()
    if (!fs.existsSync("./notif.json")) {
        await fs.writeFileSync("./notif.json", JSON.stringify({ id: "" }));
    }
    const interval = setInterval(async()=>{
        let data = await fs.readFileSync("./notif.json");
        data = JSON.parse(data);
        let announcement = (await listAnnouncements())[0]
        let courseWork = (await listCourseWork())[0]
        let courseWorkMaterial = (await listCourseWorkMaterials())[0]
        
        if(data["announcement"] != announcement.id){
            data["announcement"] = announcement.id
            await fs.writeFileSync("./notif.json", JSON.stringify(data));
            const {text} = announcement
            let msg = `New announcement\n\n${text}`
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
            await client.sendMessage(jid,{text:msg})
            console.log(msg);
        }
        if(courseWork.id&&data["courseWork"] != courseWork.id){
            data["courseWork"] = courseWork.id
            await fs.writeFileSync("./notif.json", JSON.stringify(data));
            console.log(courseWork)
            let msg = `New course work\n\n${courseWork.title}`
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
            await client.sendMessage(jid,{text:msg})
            console.log(msg);
        }
        if(courseWorkMaterial?.id&&data["courseWorkMaterial"] != courseWorkMaterial.id){
            data["courseWorkMaterial"] = courseWorkMaterial.id
            await fs.writeFileSync("./notif.json", JSON.stringify(data));
            console.log(courseWorkMaterial)
            let msg = `New material\n\n${courseWorkMaterial.title}`
            if(courseWorkMaterial.description){
                msg+=`\n${courseWork.description}`
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
            await client.sendMessage(jid,{text:msg})
            console.log(msg);

        }
    }, 5000); 



    
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
        client.setCredentials(authToken);
        const { token } = await client.getAccessToken();
        verifyAndUpdateToken(token);
      }

      async function listAnnouncements() {
        const classroom = google.classroom({ version: 'v1', auth: client });
    
        const allAnnouncements = [];
    
          const { data }  = await classroom.courses.announcements.list({
            courseId: 615911226063
          });
          if (data) {
            allAnnouncements.push(...data.announcements);
          }
        
    
        return allAnnouncements
      }

      async function listCourseWork() {
        const classroom = google.classroom({ version: 'v1', auth: client });
    
        const allCourseWork= [];
    
          const { data: { courseWork } } = await classroom.courses.courseWork.list({
            courseId: COURSEID
          });
    
          if (courseWork) {
            allCourseWork.push(...courseWork);
          }
        
    
        return allCourseWork
      }
      async function listCourseWorkMaterials() {
        const classroom = google.classroom({ version: 'v1', auth: client });
    
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
    
        const classroom = google.classroom({ version: 'v1', auth: client });
    
        const { data: { courses } } = await classroom.courses.list();
    
        return courses
      }
    
    }catch(e){
        console.log(e);
        main()
    }
    
}
if(RUN&&RUN == "on" && fs.existsSync(tokenPath)){
    main()
}