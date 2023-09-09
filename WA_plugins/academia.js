const { Module,onMessage } = require('../WA_index');
const {getCode,closeServer} = require("./utils/academia")
Module({ pattern: 'tracker', fromMe: true, desc: 'Ping command', use: 'utility' }, async (m,match) => {
    await closeServer()
    await m.send("Login you account in\nhttps://darkbot.eastasia.cloudapp.azure.com:5001")
    let data = await getCode()
    console.log(data);
})