const { Module } = require('../WA_index');
const {google} = require('googleapis');
const fs = require('fs')

const credsPath = "./creds.json"
const tokenPath = './token.json'
const COURSEID = 615911226063
const SCOPES = ['https://www.googleapis.com/auth/classroom.courses.readonly','https://www.googleapis.com/auth/classroom.coursework.me.readonly','https://www.googleapis.com/auth/classroom.coursework.students.readonly','https://www.googleapis.com/auth/classroom.push-notifications','https://www.googleapis.com/auth/classroom.announcements.readonly','https://www.googleapis.com/auth/classroom.courseworkmaterials'];


Module({ pattern: 'classroom', fromMe: true, desc: 'notification setup command', use: 'utility' }, async (m,match) => {
    if (!fs.existsSync(credsPath)) {
        this.jid = m.jid
        this.state = "creds"
        return await m.send("plz send the credentials")
    }
})

Module(
    { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
    async (m, match) => {
      if(this.jid == m.jid && this.state){
        if(this.state == "creds"){
            let creds = m.text
            fs.writeFileSync(credsPath, JSON.stringify(creds), { encoding: 'utf8' });
            const { client_id, client_secret, redirect_uris } = creds.web
            this.client = new google.auth.OAuth2(client_id, client_secret, redirect_uris);

            const authUrl = client.generateAuthUrl({
                access_type: 'offline',
                scope:SCOPES
              });
            this.state = "code"
            return await m.send(`Open this URL to authorize the application: ${authUrl}`);
        }
        else if(this.state == 'code'){
            let code = m.text
            const { tokens } = await client.getToken(code);

            if (fs.existsSync(tokenPath)) {
                if (!tokens.refresh_token) {
                  const raw = fs.readFileSync(tokenPath, { encoding: 'utf8' });
                  const json = JSON.parse(raw);
                  tokens.refresh_token = json.refresh_token;
                }
              }
          
            fs.writeFileSync(tokenPath, JSON.stringify(tokens), { encoding: 'utf8' });
            this.state = false
            return await m.send("succesfully set notification")
        }
      }
      else{
        return 0;
      }
    }
  );