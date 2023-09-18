const { Module } = require('../WA_index');
const {addShort } = require('./utils/urlshortner');


Module({ pattern: 'short', fromMe: true, desc: 'Url shortner', use: 'utility' }, async (m,match) => {
    
    if(!match[1]){
        return await m.send("Give me a url")
    }
    const url = match[1]
    addShort(url).then(async id=>{
        return await m.send("https://darkbot.eastasia.cloudapp.azure.com/short/"+id)
    }).catch(err=>{
        console.log("error in addShort");
        console.error(err)
        return m.send("An error occured while genrating url.")
    })
    
})