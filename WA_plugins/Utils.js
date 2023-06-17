const { Module } = require('../WA_index');

Module({ pattern: 'getjids', fromMe: true, desc: 'To get Group jids', use: 'utility' }, async (m,match) => {
    
    let groups = Object.keys(await m.client.groupFetchAllParticipating())
    if (!groups.length) return await m.sendReply("_No group chats!_");
    let msg = "";
    for (let e of groups){
        try {
    let g_name = (await m.client.groupMetadata(e)).subject
    } catch {let g_name = 'Can\'t load name (rate-overlimit)'}
    msg+= `_Group: ${g_name} \n_JID:_ ${e}\n\n`
    }
    await m.client.sendMessage(m.jid,{text:msg})
})
Module({ pattern: 'jid', fromMe: true, desc: 'To get Group jids', use: 'utility' }, async (m,match) => {
    
    await m.client.sendMessage(m.jid,{text:m.jid})
})