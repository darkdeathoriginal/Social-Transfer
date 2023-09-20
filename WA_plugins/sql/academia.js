const config = require('../../config');
const { DataTypes } = require('sequelize');

const academiaDb = config.DATABASE.define('academia', {
    netid: {
        type: DataTypes.STRING,
        allowNull: false
    },
    token: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    data:{
        type:DataTypes.JSON,
        allowNull:false,
    },
    jid:{
        type:DataTypes.STRING,
        allowNull:false
    }
});

module.exports = academiaDb