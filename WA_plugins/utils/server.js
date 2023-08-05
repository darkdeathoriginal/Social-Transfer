const express = require('express');
const app = express();
const port = 5001; 
let server;

async function getCode(){
    return new Promise((resolve) => {
        app.get('/', async(req, res) => {
            const code = req.query.code
            if(code){
                res.send("Connection established succesfuly")
                await server.close();
                resolve(code)
            }
            else{
                res.send("not authorised")
                await server.close(() => {
                    console.log('Server has been closed.');
                  });
                resolve(false)
            }
            
          });
          // Start the server
          server = app.listen(port, () => {
              console.log(`Server is running on port ${port}`);
        });
    })
}

module.exports = {getCode}

