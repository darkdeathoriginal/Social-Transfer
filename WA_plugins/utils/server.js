const webEmitter = require("../../server/emmiter")

async function getCode(){
  return new Promise((resolve, reject) => {
      try {
          webEmitter.on("code",(code)=>{
              resolve(code)
          })
      } catch (error) {
          reject(error)
      }
      
  })
}
module.exports = {getCode}

