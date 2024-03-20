require('dotenv').config();
DATABASE_URL = process.env.DATABASE_URL === undefined ? './bot.db' : process.env.DATABASE_URL;
const { Sequelize } = require('sequelize');


module.exports ={
    DATABASE_URL: DATABASE_URL,
    DATABASE: DATABASE_URL === './bot.db' ? new Sequelize({ dialect: "sqlite", storage: DATABASE_URL, logging: false }) : new Sequelize(DATABASE_URL, { dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }, logging: false }),   
    SUDO:['919072215994@s.whatsapp.net','14404448898:22@s.whatsapp.net',''],
    HANDLERS:process.env.HANDLERS?.split(" ")??["."],
    SERVER:process.env.SERVER || "http://localhost:3000",
    WASESSION:process.env.WASESSION,
    PORT:process.env.PORT || 3000,
}