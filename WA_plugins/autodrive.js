const { client } = require("../WA_index");
require('dotenv').config();
const {google} = require('googleapis');
const fs = require('fs')
const {DriveDb,updateDrive} = require("./sql/drive")
const { Module } = require('../WA_index');
const { fromBuffer } = require('file-type')
const { Readable } = require('stream');

const credsPath = "./creds.json"
const RUN = process.env.NOTIFICATION? process.env.NOTIFICATION:false
const jid = "919072215994@s.whatsapp.net"
let gcClients = {}
let array  ={}
const indianTimeZone = 'Asia/Kolkata';

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
    }
    catch(err){
        console.log(err);
    }
}

async function mn(){

        await DriveDb.sync()
        let data = await DriveDb.findAll()
        for(let i of data){
          main(i)
    
        }
  }
  mn()

Module(
    { pattern: "message", fromMe: true, desc: "Start command", use: "utility" },
    async (m) => {
      if(gcClients[m.jid]){
        try{

            let ob = (await DriveDb.findAll()).find(c => c.name === m.jid);
            if(m.mtype == "imageMessage"){
                const indianDate = new Date().toLocaleString('en-US', { timeZone: indianTimeZone });
                let data = {
                    name:`${indianDate}.jpg`,
                    buffer: await m.download(),
                    mime:"image/jpg",
                    fileid:ob.data.FileId
                }
                await upload(gcClients[m.jid],data)
                return await m.client.sendMessage(m.jid,{text:"file uploaded"},{quoted:m})
            }
            else if(m.mtype == "videoMessage"){
                const indianDate = new Date().toLocaleString('en-US', { timeZone: indianTimeZone });
                let data = {
                    name:`${indianDate}.mp4`,
                    buffer: await m.download(),
                    mime:"video/mp4",
                    fileid:ob.data.FileId
                }
                await upload(gcClients[m.jid],data)
                return await m.client.sendMessage(m.jid,{text:"file uploaded"},{quoted:m})
            }
            else if(m.mtype == "audioMessage"){
                const indianDate = new Date().toLocaleString('en-US', { timeZone: indianTimeZone });
                let data = {
                    name:`${indianDate}.mp3`,
                    buffer: await m.download(),
                    mime:"audio/mp3",
                    fileid:ob.data.FileId
                }
                await upload(gcClients[m.jid],data)
                return await m.client.sendMessage(m.jid,{text:"file uploaded"},{quoted:m})
            }
            else if(m.mtype == "documentMessage"){
                const indianDate = new Date().toLocaleString('en-US', { timeZone: indianTimeZone });
                let data = {
                    name:m.message.documentMessage.fileName,
                    buffer: await download(m),
                    mime: m.message.mimetype,
                    fileid:ob.data.FileId
                }
                await upload(gcClients[m.jid],data)
                return await m.client.sendMessage(m.jid,{text:"file uploaded"},{quoted:m})
            }
            else{
                return 0
            }
        }
        catch(e){
            console.log(e);
            return await m.client.sendMessage(m.jid,{text:"An error occured please try again.\nIf the error persists contact devoloper"},{quoted:m})
        }
        
      }
      else{
        return 0;
      }
    }
  );

  async function upload(client,data){
    const drive = google.drive({version: 'v3', auth:client});
    const requestBody = {
        name: data.name,
        fields: 'id',
        parents:[data.fileid]
      };
      const media = {
        mimeType: data.mime,
        body: Readable.from(data.buffer),
        }
        const file = await drive.files.create({
            requestBody,
            media: media,
          });
          console.log('File Id:', file.data.id);
        return 0;
      
  }

  function download(file){
    const { downloadMediaMessage } =require('@adiwajshing/baileys')
    return new Promise(async(resolve) => {
        const buffer = await downloadMediaMessage(
                    file,
                    'buffer',
                    { },
                    { 
                    
                    }
                )
                resolve(buffer)

    })
}