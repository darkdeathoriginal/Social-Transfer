const { Module } = require('../WA_index');
const simpleGit = require('simple-git');
const Message = require('../WA_lib/Message');
const git = simpleGit();

Module({ pattern: 'getjids', fromMe: true, desc: 'To get Group jids', use: 'utility' },
async (m,match) => {
    
    let groups = Object.keys(await m.client.groupFetchAllParticipating())
    if (!groups.length) return await m.sendReply("_No group chats!_");
    let msg = "";
    for (let e of groups){
        try {
    let g_name = (await m.client.groupMetadata(e)).subject
    msg+= `_Group:_ ${g_name} \n_JID:_ ${e}\n\n`
    } catch {let g_name = 'Can\'t load name (rate-overlimit)'}
    }
    await m.client.sendMessage(m.jid,{text:msg})
})
Module({ pattern: 'jid', fromMe: true, desc: 'To get Group jids', use: 'utility' }, async (m,match) => {
    
    await m.client.sendMessage(m.jid,{text:m.jid})
})
Module({ pattern: 'pp', fromMe: true, desc: 'change profile picture', use: 'utility' },
/**
 * 
 * @param {Message} m 
 * @param {*} match 
 * @returns 
 */
async (m,match) => {
    try{
        if(m.reply_message.image){
            await m.client.updateProfilePicture(m.client.user.id,await m.reply_message.download())
            return await m.send("Profile updated..")
        }
        else if(m.reply_message){
            let a = await m.client.profilePictureUrl(m.reply_message.jid, 'image')
            return await m.client.sendMessage(m.jid,{image:{url:a}})
        }
        else{
            return 0;
        }
    }catch(e){
        return await m.send("Profile pic not found")
    }
})
Module({ pattern: 'update', fromMe: true, desc: 'change profile picture', use: 'utility' }, async (m,match) => {
    await git.fetch();
    var commits = await git.log(['main' + '..origin/' + 'main']);
        var mss = '';
        if (commits.total === 0) {
            mss = "*Bot up to date!*"
            return await m.send(mss);
            
        }

        else if(match[1] == "start"){
            await require("simple-git")().reset("hard",["HEAD"])
            await require("simple-git")().pull()
            await m.send("Successfully updated. Please manually update npm modules if applicable!")
            process.exit(0); 
        }
        
        else {
            var changelog = "Pending updates:\n\n";
            for (var i in commits.all){
            changelog += `${(parseInt(i)+1)}• *${commits.all[i].message}*\n`
            }
        }

        changelog+=`\nUse ".update start" to start the update`
        m.send(changelog)
})