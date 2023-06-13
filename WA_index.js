const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, msgRetryCounterMap, delay } = require('@adiwajshing/baileys')
global.component = new (require('@neoxr/neoxr-js'))
const { Extra} = component
const { Socket } = Extra
const fs = require('fs');
const pino = require('pino')
const modules = [];

class AddCmd {
    constructor({ pattern, fromMe, desc, use }, callback) {
      this.pattern = pattern;
      this.fromMe = fromMe;
      this.desc = desc;
      this.use = use;
      this.callback = callback;
    }
  
    async handleEvent(m, client) {
      const text = m.message?.conversation.toLowerCase() ||""
  
      let newMessage = {
        ...m,
        client: client,
      };
      newMessage.jid = m.key.remoteJid
      
  
      if (this.pattern === "message") {
        return await this.callback(newMessage);
      } else {
        const regex = new RegExp(`^\\.${this.pattern}`);
        if (typeof(text) === 'string') {
            const match = text.match(regex);

        
        if (match) {
          try{
          return await this.callback(newMessage,match);
          }catch(e){
            client.sendMessage(newMessage.jid,{text:e})
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
           console.log(`Connected, you login as ${client.user.name || client.user.verifiedName}`);
           require("./TG_index")
        } else if (connection === 'close') {
           if (lastDisconnect.error.output.statusCode == DisconnectReason.loggedOut) {
              console.log( `Can't connect to Web Socket`);
              await props.save()
              process.exit(0)
           } else {
              connect().catch(() => connect())
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

 connect().catch(() => connect())
 
  