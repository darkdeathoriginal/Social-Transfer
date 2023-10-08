const express = require("express")
const { getToken, existingUser, addUser, getCookie } = require("../../WA_plugins/utils/academia")
const webEmitter = require("../emmiter")
const router = express.Router()

router.post("/",async(req, res) => {
    const body = req.body
    const netId = body.netid.match("@")?body.netid.split("@")[0]:body.netid
    if(await existingUser(netId)){
        res.send("Your account has already been logined")
        return
    }
    let data = await getCookie(netId+"@srmist.edu.in",body.password)
    if(data.error) return res.send("login failed. "+data.error)
    res.send('login succesfull')
    webEmitter.emit("academia",body.code+body.number)
    addUser(netId,data,body.code+body.number)
})


module.exports = router