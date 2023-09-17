const express = require("express")
const { getToken, existingUser, addUser } = require("../../WA_plugins/utils/academia")
const webEmitter = require("../emmiter")
const router = express.Router()

router.post("/",async(req, res) => {
    const body = req.body
    const netId = body.netid.match("@")?body.netid.split("@")[0]:body.netid
    if(await existingUser(netId)){
        res.send("Your account has already been logined")
        return
    }
    getToken(netId,body.password).then(data=>{
        if(data.message){
            res.send("login failed. "+data.message)
            return
        }
        res.send("login succesfull")
        webEmitter.emit("academia",body.code+body.number)
        addUser(netId,data.token,body.code+body.number)
    }).catch(err=>{
        res.send("login failed")
        console.log(err)
    })
})


module.exports = router