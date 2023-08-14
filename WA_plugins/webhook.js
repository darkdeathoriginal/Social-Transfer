const express = require('express');
const { client } = require("../WA_index");

const app = express();
const port = 5002; 
let server;

app.use(express.json());

app.get('/', async(req, res) => {
    res.send("Hello")
})
app.post('/', async(req, res) => {
    res.send("succes")
    const body = req.body
    let user = body.pusher.name
    let msg = `${user} has performed a push request in ${body.repository.name}\n`
    let n=1;
    for(let i of body.commits){
        msg+=`\n${n}• *${i.message?i.message:""}*`
        n++
    }
    await client.sendMessage("919072215994@s.whatsapp.net",{text:msg})
});
// Start the server
server = app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})