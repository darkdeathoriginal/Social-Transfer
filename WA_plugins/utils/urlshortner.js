const crypto = require('crypto');
const shortnerDb = require('../sql/shortner');
const cheerio = require("cheerio");
const axios = require("axios");
shortnerDb.sync()

function generateRandomString(length) {
    const bytes = Math.ceil(length / 2);
    return crypto.randomBytes(bytes).toString('hex').slice(0, length);
}

async function existShort(token){
    return Boolean(await shortnerDb.findOne({where:{token}}))
}
async function addShort(url){
    let token
    return await new Promise(async (resolve, reject) => {
        try {
            if(await shortnerDb.findOne({where:{url}})){
                token = (await shortnerDb.findOne({where:{url}})).dataValues.token
            }
            else{
                token = generateRandomString(6)
                while(await existShort(token)){
                    token = generateRandomString(6)
                }
            }
            await shortnerDb.create({token,url})
            resolve(token)
        } catch (error) {
            reject(error)
        }
    })
}
async function removeShort(token){
    return await new Promise(async (resolve, reject) => {
        try {
            await shortnerDb.destroy({where:{token}})
            resolve()
        } catch (error) {
            reject(error)
        }
    })
}

async function getShort(token){
    const data = await shortnerDb.findOne({where:{token}})
    if(data){
        return data.dataValues.url
    }
    return false
}

async function getMeta(url) {
    return new Promise((resolve, reject) => {
      axios(url)
        .then(async (response) => {
          const html = response.data;
          const ch = cheerio.load(html);
          let article = "";
  
          ch("meta[property]", html).each(function () {
            const property = ch(this).attr("property");
            const content = ch(this).attr("content");
  
            article += `<meta property="${property}" content="${content}">\n`;
          });
          resolve(article);
        })
        .catch((err) => {
          console.log(err);
          reject(error)
        });
    });
  }
module.exports = {
    generateRandomString,
    existShort,
    addShort,
    removeShort,
    getShort,
    getMeta
}
