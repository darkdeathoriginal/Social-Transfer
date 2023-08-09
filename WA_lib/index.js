const fs = require('fs')
const pino = require('pino')
const baileys = fs.existsSync('./node_modules/baileys') ? 'baileys' : fs.existsSync('./node_modules/@adiwajshing/baileys') ? '@adiwajshing/baileys' : 'bails'
const {
   default: makeWASocket,
   proto,
} = require(baileys)
Serialize = (client, m) => {
    if (!m) return m
    let M = proto.WebMessageInfo
    if (m.key) {
       m.id = m.key.id
       // m.id.startsWith('3EB0') && m.id.length === 12 || m.id.startsWith('3EB0') && m.id.length === 20 || 
       m.isBot = m.id.startsWith('BAE5') && m.id.length === 16 || m.id.startsWith('B24E') && m.id.length === 20
       m.jid = m.key.remoteJid
       m.fromMe = m.key.fromMe
       m.isGroup = m.jid.endsWith('@g.us')
       m.sender = m.fromMe ? (client.user.id.split(":")[0] + '@s.whatsapp.net' || client.user.id) : (m.key.participant || m.key.remoteJid)
       m.data = m.key
    }
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
       if (m.mtype === 'ephemeralMessage' || m.mtype === 'documentWithCaptionMessage') {
          Serialize(client, m.msg)
          m.mtype = m.msg.mtype
          m.msg = m.msg.msg
       }
       let quoted = m.quoted = typeof m.msg != 'undefined' ? m.msg.contextInfo ? m.msg.contextInfo.quotedMessage : null : null
       m.mentionedJid = typeof m.msg != 'undefined' ? m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : [] : []
       if (m.quoted) {
          let type = Object.keys(m.quoted)[0]
          m.quoted = m.quoted[type]
          if (['productMessage'].includes(type)) {
             type = Object.keys(m.quoted)[0]
             m.quoted = m.quoted[type]
          }
          if (['documentWithCaptionMessage'].includes(type)) {
            type = Object.keys(m.quoted.message)[0]
            m.quoted = m.quoted.message[type]
          }
          if (typeof m.quoted === 'string') m.quoted = {
             text: m.quoted
          }
          m.quoted.id = m.msg.contextInfo.stanzaId
          m.quoted.chat = m.msg.contextInfo.remoteJid || m.jid
          m.quoted.isBot = m.quoted.id ? (m.quoted.id.startsWith('BAE5') && m.quoted.id.length === 16 || m.quoted.id.startsWith('3EB0') && m.quoted.id.length === 12 || m.quoted.id.startsWith('3EB0') && m.quoted.id.length === 20 || m.quoted.id.startsWith('B24E') && m.quoted.id.length === 20) : false
          m.quoted.sender = m.msg.contextInfo.participant.split(":")[0] || m.msg.contextInfo.participant
          m.quoted.fromMe = m.quoted.sender === (client.user && client.user.id)
          m.quoted.mentionedJid = m.msg.contextInfo ? m.msg.contextInfo.mentionedJid : []
          let vM = m.quoted.fakeObj = M.fromObject({
             key: {
                remoteJid: m.quoted.chat,
                fromMe: m.quoted.fromMe,
                id: m.quoted.id
             },
             message: quoted,
             ...(m.isGroup ? {
                participant: m.quoted.sender
             } : {})
          })
          m.quoted.mtype = m.quoted != null ? Object.keys(m.quoted.fakeObj.message)[0] : null
          m.quoted.text = m.quoted.text || m.quoted.caption || (m.quoted.mtype == 'buttonsMessage' ? m.quoted.contentText : '') || (m.quoted.mtype == 'templateMessage' ? m.quoted.hydratedFourRowTemplate.hydratedContentText : '') || ''
          m.quoted.download = () => client.downloadMediaMessage(m.quoted)
       }
    }
    m.reply = (text, options) => client.sendMessage(m.jid, {
          text,
          mentions: [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net'),
          ...options
       }, {
          quoted: m
     })
    m.send = (text) => client.sendMessage(m.jid, {
          text
       })
    m.test = (image,thumb) => client.sendMessage(m.jid, {
          image:image,jpegThumbnail:thumb
       })
    m.forwardMessage = (jid,data,context) => client.sendMessage(jid, {
          forward:data
       },{contextInfo:{isForwarded:false}})
    if (typeof m.msg != 'undefined') {
       if (m.msg.url) m.download = () => client.downloadMediaMessage(m.message[m.mtype])
    }
    m.text = (m.mtype == 'stickerMessage' ? (typeof global.db.sticker[m.msg.fileSha256.toString().replace(/,/g, '')] != 'undefined') ? global.db.sticker[m.msg.fileSha256.toString().replace(/,/g, '')].text : '' : '') || (m.mtype == 'editedMessage' ? m.msg.message.protocolMessage.editedMessage.conversation : '') || (m.mtype == 'listResponseMessage' ? m.message.listResponseMessage.singleSelectReply.selectedRowId : '') || (m.mtype == 'buttonsResponseMessage' ? m.message.buttonsResponseMessage.selectedButtonId : '') || (m.mtype == 'templateButtonReplyMessage' ? m.message.templateButtonReplyMessage.selectedId : '') || (typeof m.msg != 'undefined' ? m.msg.text : '') || (typeof m.msg != 'undefined' ? m.msg.caption : '') || m.msg || ''
    Object.defineProperty(m,"client",{value:client,enumerable:false})
    return M.fromObject(m)
 }
 
exports.Serialize = Serialize