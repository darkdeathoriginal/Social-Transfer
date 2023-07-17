const { Module } = require('../WA_index');
const {google} = require('googleapis');
const fs = require('fs')
const {ClassDb, addClass ,updateClass,deleteClass} = require("./sql/classroom")

const credsPath = "./creds.json"  
const tokenPath = './token.json'
const COURSEID = 615911226063
const SCOPES = ['https://www.googleapis.com/auth/classroom.courses.readonly','https://www.googleapis.com/auth/classroom.coursework.me.readonly','https://www.googleapis.com/auth/classroom.coursework.students.readonly','https://www.googleapis.com/auth/classroom.push-notifications','https://www.googleapis.com/auth/classroom.announcements.readonly','https://www.googleapis.com/auth/classroom.courseworkmaterials'];


Module({ pattern: 'classroom', fromMe: true, desc: 'notification setup command', use: 'utility' }, async (m,match) => {
    if (!fs.existsSync(credsPath)) {
        this.jid = m.jid
        this.state = "creds"
        return await m.send("plz send the credentials")
    }else{
      let msg = '1. Add new notification\n'+
                '2. Change information\n'+
                '3. Remove notification'
      this.state = "menu"
      this.jid = m.jid
      m.send(msg)
    }
})

Module(
    { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
    async (m, match) => {
      if(this.jid == m.jid && this.state && m.text!=".classroom"){
        if(m.text == "stop"){
          this.state = false
          return 0
        }
        if(this.state == "creds"){
            let creds = JSON.parse(m.text)
            fs.writeFileSync(credsPath, JSON.stringify(creds), { encoding: 'utf8' });
            const { client_id, client_secret, redirect_uris } = creds.web
            this.client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

            const authUrl = this.client.generateAuthUrl({
                access_type: 'offline',
                prompt:"consent",
                scope:SCOPES
              });
            this.state = "code"
            return await m.send(`Open this URL to authorize the application: ${authUrl}`);
        }
        else if(this.state == 'code'){
            let code = m.text
            let path = `./${this.name}.json`
            const { tokens } = await this.client.getToken(code);

            if (fs.existsSync(path)) {
                if (!tokens.refresh_token) {
                  const raw = fs.readFileSync(path, { encoding: 'utf8' });
                  const json = JSON.parse(raw);
                  tokens.refresh_token = json.refresh_token;
                }
              }
          
            fs.writeFileSync(path, JSON.stringify(tokens), { encoding: 'utf8' });
            this.client.setCredentials(tokens);
            this.state = "options"
            await m.send("succesfully set notification")
            let courses = await getCourses(this.client) 
            let n = 1
            let data = {}
            let msg =''
            for(let i of (courses)){
              msg+=`${n}. ${i.descriptionHeading} (${i.id})\n`
              data[n]={name:i.descriptionHeading,id:i.id}
              n++
            }
            msg += `0. For all cources`
            this.data = data
            return await m.send(msg)

        }
        else if(this.state == "menu"){
          var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false
          if (!no) throw "_Reply must be  a number_";
          if(no == '1'){
            this.state = "name"
            m.send("Give a name")
          }
          else if(no == '2'){
            let cources = await ClassDb.findAll()
            let n = 1
            let msg =''
            let data = {}
            for(let i of cources){
              msg += `${n}. ${i.name}\n`
              data[n] = i
              n++
            }
            this.data = data
            this.state = 'query'
            return await m.send(msg)
          }
          else if(no == '3'){
            this.state = "delete"
            let array = (await ClassDb.findAll()).map(e=>e.name)
            let msg =''
            let n = 1
            arr = {}
            for(let i of array){
              msg += `${n}. ${i}\n`
              arr[n]=i
              n++
            }
            this.array = arr
            return await m.send(msg)
          }
          else{
            this.state = false
            m.send("Invalid option")
          }
        }
        else if(this.state == "name"){
          this.name = m.text
          let creds = require("../creds.json")
          const { client_id, client_secret, redirect_uris } = creds.web
            this.client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

            const authUrl = this.client.generateAuthUrl({
                access_type: 'offline',
                prompt:"consent",
                scope:SCOPES
              });
            this.state = "code"
            return await m.send(`Open this URL to authorize the application: ${authUrl}`);
        }
        else if(this.state == "options"){
          var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false
          if (!no) throw "_Reply must be  a number_";
          if(no == "0"){
            this.cources = Object.values(this.data)
            this.state = "jid"
            return await m.send("send the jid for notification.\nType 'this' for using current jid")
          }
          else if(this.data[no]){
            this.cources =[this.data[no]]
            this.state = "jid"
            return await m.send("send the jid for notification.\nType 'this' for using current jid")
          }
          else{
            this.state = false
            m.send("Invalid option")
          }
        }
        else if(this.state == "jid"){
          ClassDb.sync()
          let text = m.text
          if(text == "this"){
            this.forward = m.jid
            let state = {}
            for(let i of this.cources){
              state[i.id]={}
            }
            let data = {
                        cources:this.cources,
                        forward:this.forward,
                        state:state
                      }
            await addClass(this.name,data)
            await m.send("done")
            process.exit(0);
            return 0;
          }
          else{
            this.forward = text
            let data = {
              courses:this.cources,
              forward:this.forward,
              state:{}
            }
            await addClass(this.name,data)
          }
        }
        else if(this.state == "delete"){
          var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false
          if (!no) throw "_Reply must be  a number_";
          if(this.array[no]){
            let name = this.array[no]
            await deleteClass(name)
            this.state = false
            await fs.unlinkSync(`./${name}.json`)
            await m.send("succesfully removed")
            process.exit(0);
  
          }
          else{
            this.state = false
            await m.send("Invalid option")
          }
        }
        else if(this.state == "query"){
          var no = /\d+/.test(m.text) ? m.text.match(/\d+/)[0] : false
          if (!no) throw "_Reply must be  a number_";
          if(this.data[no]){
            this.name = this.data[no].name
            this.data = this.data[no].data
            this.state = "newjid"
            return await m.send("Enter new jid")
          }
          else{
            this.state = false
            await m.send("Invalid option")
          }
        }
        else if(this.state == "newjid"){
          let jid = m.text
          this.data.forward = jid
          let a = await updateClass(this.name,this.data)
          this.state = false
          
          await m.send(a?"Succesfully changed jid":"error")
          process.exit(0);

        }
      }
      
      else{
        return 0;
      }
    }
  );
  async function getCourses(client) {
    const classroom = google.classroom({ version: 'v1', auth: client });

    const { data: { courses } } = await classroom.courses.list();
    return courses
  }