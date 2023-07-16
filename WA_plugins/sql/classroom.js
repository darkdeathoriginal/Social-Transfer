const config = require('../../config');
const { DataTypes } = require('sequelize');

const ClassDb = config.DATABASE.define('Class', {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.JSON,
        allowNull: false
    }
});

async function addClass(name, data) {
    var Plugin = await ClassDb.findAll({
        where: {name: name}
    });

    if (Plugin.length >= 1) {
        return false;
    } else {
        return await ClassDb.create({ data: data, name: name });
    }
}
async function updateClass(name, data) {
    const plugin = await ClassDb.findOne({
        where: { name: name }
    });

    if (!plugin) {
        return false;
    }

    plugin.data = data;
    await plugin.save();
    return true; 
}
async function deleteClass(name) {
    const deletedRows = await ClassDb.destroy({
      where: { name: name },
    });
  
    return deletedRows > 0;
  }
module.exports = { ClassDb: ClassDb, addClass: addClass ,updateClass:updateClass,deleteClass:deleteClass};