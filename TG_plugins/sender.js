const { Module } = require("../TG_index");
const { client } = require("../WA_index");
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

Module(
  {
    pattern: "sender ?(.*)",
    fromMe: true,
    desc: "whatsapp sender",
    use: "utility",
  },
  async (m, match) => {
    await chatDb.sync();
    let a = await m.waitForReply(
      m.jid,
      "Send the username of the chat you want to forward messages from."
    );
    let b = await m.waitForReply(
      m.jid,
      "Send the Jid of the chat you want to forward messages to."
    );
    await createTable(a, b);
    m.send("succesfully set sender");
  }
);

Module(
  {
    pattern: "message",
    fromMe: false,
  },
  async (m, match) => {
    await chatDb.sync();
    let username = await m.getUsername(m.jid);
    let array = (await chatDb.findAll()).map((e) => {
      return { from: e.dataValues.from, to: e.dataValues.to };
    });
    for (let i of array) {
      if (i.from == username) {
        let id = m.message.id;
        const result = await m.client.getMessages(m.jid, {
          ids: id,
        });
        const media = result[0];
        if (media) {
          const buffer = await m.client.downloadMedia(media, {
            workers: 14,
          });
          if (result[0]?.media?.photo) {
            let caption = result[0].message || ""
            if(result[0]?.replyMarkup?.rows[0]?.buttons){
              for(let i of result[0].replyMarkup.rows[2]?result[0].replyMarkup.rows[1].buttons:result[0].replyMarkup.rows[0].buttons){
                caption += `\n${i.text} : ${i.url}`
              }
            }
            caption.replace(/#.*/g,"").replace("\n\n\n","\n")
            client.sendMessage(i.to, {
              image: buffer,
              caption: caption,
            });
          }
        }
      }
    }
  }
);
