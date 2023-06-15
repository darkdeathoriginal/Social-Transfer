const { Module } = require('../WA_index');
var types = "video,image"
const config = require("../config");
const { DataTypes } = require("sequelize");
const chatDb = config.DATABASE.define("chat", {
  from: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  to: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

async function createTable(from, to) {
  var chats = await chatDb.findAll({
    where: { from: from },
  });

  if (chats.length >= 1) {
    return false;
  } else {
    return await chatDb.create({ from: from, to: to });
  }
}
async function deleteTable(from) {
  const deletedRows = await chatDb.destroy({
    where: { from: from },
  });

  return deletedRows > 0;
}

Module({ pattern: 'sender ?(.*)', fromMe: true, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    if(match[1]=="get"){
        let a = ''
        let array = (await chatDb.findAll()).map((e) => {
            return { from: e.dataValues.from, to: e.dataValues.to };
          });
        for(let i of array){
            a+=`from: ${i.from}\nto: ${i.to}\n\n`
        }
        return await m.client.sendMessage(m.jid,{text:a})
    }
    const from =match[1].split(";")[0]
    const to =match[1].split(";")[1]
    await createTable(from, to);
    return await m.client.sendMessage(m.jid,{text:"succesfully added.."})
})
Module({ pattern: 'del ?(.*)', fromMe: true, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    const from =match[1]
    await deleteTable(from).then(m.client.sendMessage(m.jid,{text:"succesfully deleted.."}))
})
Module({ pattern: 'message', fromMe: false, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    await chatDb.sync();
    let array = (await chatDb.findAll()).map((e) => {
      return { from: e.dataValues.from, to: e.dataValues.to };
    });
    for (let i of array) {
        if(i.from == m.jid){
            let mtp = Object.keys(m.data.message)[0].replace("Message","")
            if (types.split(",").includes(mtp)){
                await m.forwardMessage(i.to,m.data,{contextInfo:{isForwarded:false}})
                await new Promise((r) => setTimeout(r, 2000))
            }
        }
    }

})
