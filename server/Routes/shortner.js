const express = require("express")
const webEmitter = require("../emmiter")
const { getShort } = require("../../WA_plugins/utils/urlshortner")
const router = express.Router()


router.get("/:id",async(req,res)=>{
    const id = req.params.id
    if(id){
        const url = await getShort(id)
        if(url){
            return res.redirect(url)
        }
        return res.send("Url not found")
    }
    return res.send("invalid url")
})

module.exports = router