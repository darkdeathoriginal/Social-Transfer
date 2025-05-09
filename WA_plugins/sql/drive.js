const config = require('../../config');
const { DataTypes } = require('sequelize');

const DriveDb = config.DATABASE.define('Drive', {
    jid: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.JSON,
        allowNull: false
    }
});

async function addDrive(name, data) {
    var Plugin = await DriveDb.findAll({
        where: {jid: name}
    });

    if (Plugin.length >= 1) {
        return false;
    } else {
        return await DriveDb.create({ data: data, jid: name });
    }
}
async function updateDrive(name, data) {
    const plugin = await DriveDb.findOne({
        where: { jid: name }
    });

    if (!plugin) {
        return false;
    }

    plugin.data = data;
    await plugin.save();
    return true; 
}
async function deleteDrive(name) {
    const deletedRows = await DriveDb.destroy({
      where: { jid: name },
    });
  
    return deletedRows > 0;
  }
module.exports = { DriveDb: DriveDb, addDrive: addDrive ,updateDrive:updateDrive,deleteDrive:deleteDrive};