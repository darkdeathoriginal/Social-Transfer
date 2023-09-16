const express = require("express")
const { client } = require("../../WA_index")
const router = express.Router()


router.post("/",async(req,res)=>{
    const body = req.body
    const jid = req.query.jid || "919072215994@s.whatsapp.net"
    if(!body){
        return res.send("no body")
    }
    res.send("succes")
    let user = body.pusher.name
    let msg = `${user} has performed a push request in ${body.repository.name}\n`
    msg+='\nCommits :'
    let n=1;
    for(let i of body.commits){
        msg+=`\n${n}• *${i.message?i.message:""}*`
        n++

    }
    client.sendMessage(jid,{text:msg})
    
})

module.exports = router