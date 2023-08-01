const config = require('../../config');
const { DataTypes } = require('sequelize');

const welcomeDb = config.DATABASE.define('welcome', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

async function addwelcome(name, data) {
    var Plugin = await welcomeDb.findAll({
        where: {name: name}
    });

    if (Plugin.length >= 1) {
        return false;
    } else {
        return await welcomeDb.create({ data: data, name: name });
    }
}
async function updatewelcome(name, data) {
    const plugin = await welcomeDb.findOne({
        where: { name: name }
    });

    if (!plugin) {
        return false;
    }

    plugin.data = data;
    await plugin.save();
    return true; 
}
async function deletewelcome(name) {
    const deletedRows = await welcomeDb.destroy({
      where: { name: name },
    });
  
    return deletedRows > 0;
  }
module.exports = { welcomeDb: welcomeDb, addwelcome: addwelcome ,updatewelcome:updatewelcome,deletewelcome:deletewelcome};