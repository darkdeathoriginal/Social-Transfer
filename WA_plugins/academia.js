const { Module,onMessage,onReady } = require('../WA_index');
const webEmitter = require('../server/emmiter');
const academiaDb = require('./sql/academia');
const {filterCources, getDetails} = require("./utils/academia")
Module({ pattern: 'academia', fromMe: true, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    if(match[1] && match[1] =="del"){
        const db = await academiaDb.findOne({where:{jid:m.jid}})
        if(db){
            await academiaDb.destroy({where:{jid:m.jid}})
            return await m.send("Your account has been removed")
        }
        else{
            return await m.send("No account found")
        }
    }
    await m.send("Login you account in\nhttps://darkbot.eastasia.cloudapp.azure.com:5001/academia?number=%2B"+m.jid.split("@")[0])
})

onReady({},async(client)=>{
    run(client)
    webEmitter.on("academia",async(number)=>{
        const jid = number+"@s.whatsapp.net"
        await client.sendMessage(jid,{
            text:'Your account has been set for attendace tracker.'+
            "\nIf this wasn't you then you can send *.academia del* to remove your account"
        }).catch(err=>{
            console.log("error in tracker message");
            console.error(err)
        })
    })
})
async function run(client){
    while(true){
        const trackers = await academiaDb.findAll()
        for(let i of trackers){
            const jid = i.jid
            const data = filterCources(await getDetails(i.token))
            let change = false
            for(let j of Object.keys(i.data)){
                if(i.data[j].conducted !== data[j].conducted){
                    change = true
                    const conductedDiff = data[j].conducted-i.data[j].conducted
                    const absentDiff = data[j].absent-i.data[j].absent
                    let msg = `Attendace for ${data[j].name} has been updated\n\n`
                    if(absentDiff !== data[j].absent){
                        msg+= `You have been marked absent for ${absentDiff} hour${absentDiff>1?"s":""}`
                    }
                    else{
                        msg+= `You have been marked present for ${conductedDiff} hour${conductedDiff>1?"s":""}`
                    }
                    client.sendMessage(jid,{text:msg}).catch(err=>{
                        console.log("error in tracker run")
                        console.error(err)
                    })
                }
                if(change){
                    i.data = data
                    await i.save()
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
}