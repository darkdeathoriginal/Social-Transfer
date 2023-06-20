const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, msgRetryCounterMap, delay } = require('@adiwajshing/baileys')
global.component = new (require('@neoxr/neoxr-js'))
const { Extra} = component
const { Socket } = Extra
const fs = require('fs');
const pino = require('pino')
const modules = [];
const util = require("util");

class AddCmd {
    constructor({ pattern, fromMe, desc, use }, callback) {
      this.pattern = pattern;
      this.fromMe = fromMe;
      this.desc = desc;
      this.use = use;
      this.callback = callback;
    }
  
    async handleEvent(m, client) {
      const text = m.message?.conversation ||m.message?.extendedTextMessage?.text ||false
      if (m.message) {
         if (m.message.viewOnceMessage) {
            m.mtype = Object.keys(m.message.viewOnceMessage.message)[0]
            m.msg = m.message.viewOnceMessage.message[m.mtype]
         } else if (m.message.viewOnceMessageV2) {
            m.mtype = Object.keys(m.message.viewOnceMessageV2.message)[0]
            m.msg = m.message.viewOnceMessageV2.message[m.mtype]
         } else {
            m.mtype = Object.keys(m.message)[0] == 'senderKeyDistributionMessage' ? Object.keys(m.message)[2] == 'messageContextInfo' ? Object.keys(m.message)[1] : Object.keys(m.message)[2] : Object.keys(m.message)[0] != 'messageContextInfo' ? Object.keys(m.message)[0] : Object.keys(m.message)[1]
            m.msg = m.message[m.mtype]
         }
      }
      let newMessage = {}
      newMessage.jid = m.key.remoteJid
      newMessage.message =  m.message?.conversation||m.message.extendedTextMessage.text
      newMessage.data = m
      newMessage.quoted = m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null 
      if (newMessage.quoted) {
         let type = Object.keys(newMessage.quoted)[0]
         newMessage.quoted = newMessage.quoted[type]
         if (['productMessage'].includes(type)) {
            type = Object.keys(newMessage.quoted)[0]
            newMessage.quoted = newMessage.quoted[type]
         }
         if (['documentWithCaptionMessage'].includes(type)) {
           type = Object.keys(newMessage.quoted)[0]
           newMessage.quoted = newMessage.quoted.message[type]
         }
         if (typeof newMessage.quoted === 'string') newMessage.quoted = {
            text: newMessage.quoted
         }
         newMessage.quoted.id = m.msg.contextInfo.stanzaId
         newMessage.quoted.chat = m.msg.contextInfo.remoteJid || m.chat
         newMessage.quoted.sender = m.msg.contextInfo.participant.split(":")[0] || m.msg.contextInfo.participant
         newMessage.quoted.fromMe = newMessage.quoted.sender === (client.user && client.user.id)
         newMessage.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
         newMessage.quoted.download = () => client.downloadMediaMessage(newMessage.quoted)
      }
   
      newMessage.message = m.message?.conversation||m.message.extendedTextMessage.text
      newMessage.client = client
      newMessage.forwardMessage = async(jid,data,context={})=>{
         return await client.sendMessage(jid,{forward:data},context)
      }
      newMessage.send = async(text)=>{
         return await client.sendMessage(newMessage.jid,{text:text})
      }
      
  
      if (this.pattern === "message") {
        return await this.callback(newMessage);
      } else {
        const regex = new RegExp(`^\\.${this.pattern}`,'i');
        if (typeof(text) === 'string') {
            const match = text.match(regex);

        
        if (match) {
          try{
            client.readMessages([newMessage.data.key])
          return await this.callback(newMessage,match);
          }catch(e){
            client.sendMessage(newMessage.jid,{text:util.format(e)})
          }
        }}
      }
    }
  }

  function Module(moduleConfig, callback) {
    const { pattern, fromMe, desc, use } = moduleConfig;
    const module = new AddCmd({ pattern, fromMe, desc, use }, callback);
    modules.push(module);
  }
Module({ pattern: 'start', fromMe: true, desc: 'Start command', use: 'utility' }, async (m) => {
await m.client.sendMessage(m.jid, {
    text: `Hi, your ID is ${m.jid}`,
});
});
const store = makeInMemoryStore({
    logger: pino().child({
       level: 'silent',
       stream: 'store'
    })
 })
 
 store.readFromFile('./session/neoxr_store.json')
 setInterval(() => {
    store.writeToFile('./session/neoxr_store.json')
 }, 10000)

 const connect = async () => {
    const { state, saveCreds } = await useMultiFileAuthState('session')
    const client = Socket({
        logger: pino({
           level: 'silent'
        }),
        printQRInTerminal: true,
        patchMessageBeforeSending: (message) => {
           const requiresPatch = !!(
              message.buttonsMessage ||
              message.templateMessage ||
              message.listMessage
           );
           if (requiresPatch) {
              message = {
                 viewOnceMessage: {
                    message: {
                       messageContextInfo: {
                          deviceListMetadataVersion: 2,
                          deviceListMetadata: {},
                       },
                       ...message,
                    },
                 },
              }
           }
           return message
        },
        browser: ['@neoxr / neoxr-bot', 'safari', '1.0.0'],
        auth: state,
        getMessage: async (key) => {
           if (store) {
              const msg = await store.loadMessage(key.remoteJid, key.id)
              return msg.message || undefined
           }
           return {
              conversation: 'hello'
           }
        },
        // To see the latest version : https://web.whatsapp.com/check-update?version=1&platform=web
        version: [2, 2308, 7]
     })
     store.bind(client.ev)
     client.ev.on('connection.update', async (update) => {
        const {
           connection,
           lastDisconnect,
           qr
        } = update
        if (lastDisconnect == 'undefined' && qr != 'undefined') {
           qrcode.generate(qr, {
              small: true
           })
        }
        if (connection === 'connecting') {
         console.log('connecting');
       } else if (connection === 'open') {
         module.exports = {
            Module,
            modules,
            client
         
          };
          const pluginFolder = "./WA_plugins/";
  const files = fs.readdirSync(pluginFolder);

  files.forEach((file) => {
    if (file.endsWith('.js')) {
      const filePath = pluginFolder+file;
      require(filePath);
    }
  });
         client.sendMessage("919072215994@s.whatsapp.net",{text:"bot started"})
           console.log(`Connected, you login as ${client.user.name || client.user.verifiedName}`);
           require("./TG_index")
        } else if (connection === 'close') {
           if (lastDisconnect.error.output.statusCode == DisconnectReason.loggedOut) {
              console.log( `Can't connect to Web Socket`);
              await props.save()
              process.exit(0)
           } else {
           }
        }
     })
     client.ev.on('creds.update', saveCreds)
     client.ev.on('messages.upsert', async chatUpdate => {
        try {
           m = chatUpdate.messages[0]

           if (!m.message) return
           for (const module of modules) {
            await module.handleEvent(m, client);
          }
        } catch (e) {
           console.log(e)
        }
     })

 }

 connect().catch((e) => console.log(e))
 
  