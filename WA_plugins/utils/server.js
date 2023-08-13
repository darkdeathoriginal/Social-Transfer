const express = require('express');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 5001; 

const privateKey = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/darkbot.eastasia.cloudapp.azure.com/chain.pem', 'utf8'); // Optional: Chain certificate

const credentials = {
  key: privateKey,
  cert: certificate,
  ca: ca, // Optional: Chain certificate
};

const server = https.createServer(credentials, app);
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
          server.listen(port, () => {
            console.log(`Server is running on port ${port}`);
          });
          
    })
}
async function closeServer(){
  return await server.close();
}
module.exports = {getCode,closeServer}

