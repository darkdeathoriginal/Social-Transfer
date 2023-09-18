const config = require('../../config');
const { DataTypes } = require('sequelize');

const shortnerDb = config.DATABASE.define('shortner', {
    token: {
        type: DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false
    },

});

module.exports = shortnerDb