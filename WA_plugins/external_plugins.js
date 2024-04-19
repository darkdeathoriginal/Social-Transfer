const {
    Module
} = require('../WA_index');
const Config = require('../config');
const axios = require('axios');
const fs = require('fs');
const Db = require('./sql/plugin');


Module({
    pattern: 'install',
    fromMe: true,
    use: 'owner',
    desc: "plugin installer"
}, (async (message, match) => {
    match = match[1]
    if (!match || !/\bhttps?:\/\/\S+/gi.test(match)) return await message.send("need url")
    await Db.PluginDB.sync();
    let links = match.match(/\bhttps?:\/\/\S+/gi);
    for (let link of links){
    try {
        var url = new URL(link);
    } catch {
        return await message.send("invalid url");
    }
    if (url.host === 'gist.github.com' || url.host === 'gist.githubusercontent.com') {
        url = !url?.toString().endsWith('raw')?url.toString() + '/raw':url.toString()
    } else {
        url = url.toString()
    }
    try {
        var response = await axios(url+"?timestamp="+new Date());
    } catch {
        return await message.send("invalid url")
    }
    let plugin_name = /pattern: ["'](.*)["'],/g.exec(response.data)
    var plugin_name_temp = response.data.match(/pattern: ["'](.*)["'],/g)?response.data.match(/pattern: ["'](.*)["'],/g).map(e=>e.replace("pattern","").replace(/[^a-zA-Z]/g, "")):"temp"
    try { plugin_name = plugin_name[1].split(" ")[0] } catch { return await message.sendReply("_Invalid plugin. No plugin name found!_") }
    fs.writeFileSync('./WA_plugins/' + plugin_name + '.js', response.data);
    plugin_name_temp = plugin_name_temp.length > 1 ? plugin_name_temp.join(", ") : plugin_name;
    try {
        require('./' + plugin_name);
    } catch (e) {
        fs.unlinkSync(__dirname+'/'+plugin_name + '.js')
        return await message.send("invalid plugin\n" + e);
    }
    await Db.installPlugin(url, plugin_name);
    await message.send(plugin_name_temp+" installed.");
}
}));

Module({
    pattern: 'plugin',
    fromMe: true,
    use: 'owner',
    desc: "plugin list"
}, (async (message, match) => {
    await Db.PluginDB.sync();
    var plugins = await Db.PluginDB.findAll();
    if (match[1]&&match[1] !== '') {
        var plugin = plugins.filter(_plugin => _plugin.dataValues.name === match[1])
        try {
            await message.send(`_${plugin[0].dataValues.name}:_ ${plugin[0].dataValues.url}`);
        } catch {
            return await message.send("plugin not found")
        }
        return;
    }
    var msg = "\n";
    if (plugins.length < 1) {
        console.log(plugins);
        return await message.send("plugin not found");
    } else {
        plugins.map(
            (plugin) => {
                msg += '*' +plugin.dataValues.name + '* : ' +( plugin.dataValues.url.endsWith("/raw")?plugin.dataValues.url.replace('raw',''):plugin.dataValues.url) + '\n\n';
            }
        );
        return await message.send(msg);
    }
}));

Module({
    pattern: 'rmp',
    fromMe: true,
    use: 'owner',
    desc: "plugin remover"
}, (async (message, match) => {
    if (match[1] === '') return await message.send("need plugin");
    await Db.PluginDB.sync();
    var plugin = await Db.PluginDB.findAll({
        where: {
            name: match[1]
        }
    });
    if (plugin.length < 1) {
        return await message.send("plugin not found");
    } else {
        await plugin[0].destroy();
        const Message = match[1]+" removed succesfully" 
        await message.send(Message);
        delete require.cache[require.resolve('./' + match[1] + '.js')]
        fs.unlinkSync('./WA_plugins/' + match[1] + '.js');
       }
}));