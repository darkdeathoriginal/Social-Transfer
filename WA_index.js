const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore  } = require('@adiwajshing/baileys')
global.component = new (require('@neoxr/neoxr-js'))
const { Extra} = component
const { Socket } = Extra
const fs = require('fs');
const pino = require('pino')
const modules = {};
const onMessages = []
const {Serialize} = require("./WA_lib/index")
const {welcomeDb} = require("./WA_plugins/sql/welcome")
const JIDS = ['919072215994@s.whatsapp.net','14404448898:22@s.whatsapp.net','']
const handlers = ['.'];


function Module(obj, callback) {
   obj.callback = callback
   modules[obj.pattern] = obj;
}
function onMessage(obj, callback) {
   obj.callback = callback
   onMessages.push(obj)
}

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
        browser: ['@dark / dark-bot', 'safari', '1.0.0'],
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
			onMessage,
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
            process.exit(0)
           }
        }
     })
     client.ev.on('creds.update', saveCreds)
     client.ev.on('group-participants.update', async groupUpdate =>{
         await welcomeDb.sync()
         const data = await welcomeDb.findAll()
         const jid = groupUpdate.id
         let tt = data.find(c => c.name === jid);
         try{
            if(tt && groupUpdate.action == "add"){
               let text = tt.data
               const {subject,desc} = await client.groupMetadata(groupUpdate.id)
               const participant = groupUpdate.participants[0]
               const picture = await client.profilePictureUrl(participant, 'image').catch(e=>console.log(e))
               text =text.replace("{user}",`@${participant.split("@")[0]}`).replace("{subject}",`${subject}`).replace("{desc}",`${desc}`).replaceAll("\\n",`\n`)
               if(text.match("{pp}")&&picture){
                  text = text.replace("{pp}",``)
                  await client.sendMessage(groupUpdate.id,{image :{url:picture} ,caption: text,mentions:[participant]})
               }
               else{
                  await client.sendMessage(groupUpdate.id,{text: text,mentions:[participant]})
               }
            }
         }catch(e){
            console.log(e);
         }
     })
     client.ev.on('messages.upsert', async chatUpdate => {
        try {
           m = chatUpdate.messages[0]

           if (!m.message||m.key.id.startsWith("BAE")) return
           client.readMessages([m.key])
           Serialize(client,m)
           
           const regexPattern = `^[${handlers.map(handler => `\\${handler}`).join('')}]([a-zA-Z]+)(?:\\s+(.+))?`;
           const text = m.text
		   if (typeof(text) === 'string') {
            
			   const regex = new RegExp(regexPattern);
			   const match = text.match(regex);
			   if (match) {
               match.shift()
				   let command = modules[match[0]]
               let jid = m.key.participant?m.key.participant:m.key.remoteJid
				   if(command && (!command.fromMe || JIDS.includes(jid))){
					   command.callback(m,match)
				   }
			   }
		   }
			for(let i of onMessages){
				if(!i.fromMe || JIDS.includes(m.key.remoteJid)){
					i.callback(m)
				}
			}
        } catch (e) {
           console.log(e);
        }
     })

 }

 connect().catch((e) => process.exit(0))
 
  