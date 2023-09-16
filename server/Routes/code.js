const express = require("express")
const webEmitter = require("../emmiter")
const router = express.Router()


router.get("/",(req,res)=>{
    const code = req.query.code
    if(code){
        webEmitter.emit("code",code)
        res.send("Connection established succesfuly")
    }
    else{
        res.send("not authorised")
    }
    
})

module.exports = router